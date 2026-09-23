import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getCurrentUser } from '@/lib/auth';
import {
  GitLabCredentials,
  GitLabCredentialsError,
  getUserGitLabCredentials,
  gitLabAuthHeaders,
} from '@/lib/gitlab/credentials';
import { GitLabUrlError, isSameOrigin, resolveRedirectUrl } from '@/lib/gitlab/url';
import { logger } from '@/lib/logger';

const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const jobId = searchParams.get('jobId');
  const rawFilename = searchParams.get('filename') || 'artifacts.zip';

  if (!projectId || !jobId) {
    return NextResponse.json({ error: 'Missing projectId or jobId' }, { status: 400 });
  }

  const projectIdNum = Number(projectId);
  const jobIdNum = Number(jobId);

  if (!Number.isSafeInteger(projectIdNum) || projectIdNum <= 0 || !Number.isSafeInteger(jobIdNum) || jobIdNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid projectId or jobId - must be positive integers' },
      { status: 400 }
    );
  }

  const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - please login' }, { status: 401 });
  }

  let credentials: GitLabCredentials;
  try {
    credentials = getUserGitLabCredentials(user);
  } catch (error) {
    if (error instanceof GitLabCredentialsError) {
      if (error.code === 'GITLAB_TOKEN_UNREADABLE') {
        logger.error('Failed to decrypt GitLab token for artifact download', { userId: user.id });
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
  const { baseUrl } = credentials;

  let url = `${baseUrl}/api/v4/projects/${projectIdNum}/jobs/${jobIdNum}/artifacts`;

  try {
    // Redirects are followed manually: GitLab answers this endpoint with a 302
    // to object storage when direct download is enabled. The token is only
    // attached while the request stays on the configured GitLab origin.
    for (let hop = 0; ; hop++) {
      const response = await axios.get<ArrayBuffer>(url, {
        headers: isSameOrigin(url, baseUrl) ? gitLabAuthHeaders(credentials) : {},
        responseType: 'arraybuffer',
        maxRedirects: 0,
        timeout: DOWNLOAD_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      if (response.status >= 300) {
        const location = response.headers?.location;
        if (typeof location !== 'string' || !location) {
          return NextResponse.json({ error: 'GitLab returned a redirect without a location' }, { status: 502 });
        }
        if (hop >= MAX_REDIRECTS) {
          return NextResponse.json({ error: 'Too many redirects from GitLab' }, { status: 502 });
        }
        url = resolveRedirectUrl(location, url).toString();
        continue;
      }

      const data = response.data as ArrayBuffer | Buffer;
      return new NextResponse(data as BodyInit, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(data.byteLength),
        },
      });
    }
  } catch (error) {
    if (error instanceof GitLabUrlError) {
      logger.warn('Rejected unsafe artifact redirect', { reason: error.message });
      return NextResponse.json({ error: 'GitLab returned an unsafe redirect' }, { status: 502 });
    }

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    // Log only status/code: the axios error carries request headers, including the token.
    logger.error('Artifact download failed', {
      status,
      code: axios.isAxiosError(error) ? error.code : undefined,
    });

    if (status === 401 || status === 403 || status === 404) {
      const message = status === 404 ? 'Artifact not found' : 'GitLab denied access to the artifact';
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ error: 'Failed to download artifact' }, { status: 502 });
  }
}
