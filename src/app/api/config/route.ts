import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { getCurrentUser } from '@/lib/auth';
import { requireCsrf } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { encryptToken, testGitLabConnection } from '@/lib/gitlab/token';
import {
  StoredConnectionTestResult,
  getStoredTokenStatus,
  testStoredGitLabConnection,
} from '@/lib/gitlab/credentials';
import { GitLabUrlError, normalizeGitLabBaseUrl } from '@/lib/gitlab/url';
import { formatValidationError, userGitLabConfigUpdateSchema } from '@/lib/validation';

// Placeholders the UI may echo back instead of a real token; never store them.
const MASKED_TOKEN_VALUES = new Set(['***MASKED***', '***']);

/** Length of the stored token for the masked response; logs when it cannot be decrypted. */
function storedTokenLength(gitlabToken: string | null | undefined, userId: string): number {
  const status = getStoredTokenStatus({ gitlabToken });
  if (!status.readable) {
    logger.error('Failed to decrypt stored GitLab token', { userId });
  }
  return status.length;
}

// GET /api/config - Get user's GitLab configuration. The token is always masked.
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      url: user.gitlabUrl,
      token: user.gitlabToken ? '***MASKED***' : '',
      tokenConfigured: !!user.gitlabToken,
      tokenLength: storedTokenLength(user.gitlabToken, user.id),
      autoRefresh: user.autoRefresh,
      refreshInterval: user.refreshInterval,
      theme: user.theme,
      notifyPipelineFailures: user.notifyPipelineFailures,
      notifyPipelineSuccess: user.notifyPipelineSuccess,
    });
  } catch (error) {
    logger.error('Failed to fetch config', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

// POST /api/config - Update user's GitLab configuration
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = userGitLabConfigUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid configuration', details: formatValidationError(parsed.error) },
        { status: 400 }
      );
    }
    const body = parsed.data;

    let gitlabUsername: string | undefined;
    let gitlabUrl: string | undefined;
    if (body.url !== undefined) {
      try {
        gitlabUrl = normalizeGitLabBaseUrl(body.url);
      } catch (error) {
        const message = error instanceof GitLabUrlError ? error.message : 'Invalid GitLab URL';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const submittedToken =
      body.token === undefined || MASKED_TOKEN_VALUES.has(body.token) ? '' : body.token.trim();

    // Changing the URL or token: verify the connection from the server before saving.
    let gitlabToken: string | undefined;
    if (gitlabUrl !== undefined || submittedToken) {
      const targetUrl = gitlabUrl ?? user.gitlabUrl;

      // Without a new token the stored one is reused, but only for the same
      // GitLab origin (enforced by testStoredGitLabConnection).
      const result: StoredConnectionTestResult = submittedToken
        ? { tested: true, ...(await testGitLabConnection(targetUrl, submittedToken)) }
        : await testStoredGitLabConnection(user, targetUrl);

      if (!result.tested) {
        if (result.reason === 'NEW_TOKEN_REQUIRED') {
          return NextResponse.json(
            { error: 'Enter an access token for this GitLab URL', code: 'GITLAB_NEW_TOKEN_REQUIRED' },
            { status: 400 }
          );
        }
        logger.error('Failed to decrypt stored GitLab token', { userId: user.id });
        return NextResponse.json(
          { error: 'Stored GitLab token could not be read. Re-enter the token.', code: 'GITLAB_STORED_TOKEN_UNREADABLE' },
          { status: 400 }
        );
      }

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Could not connect to GitLab', code: 'GITLAB_CONNECTION_FAILED' },
          { status: 400 }
        );
      }
      gitlabUsername = result.username;
      if (submittedToken) {
        gitlabToken = encryptToken(submittedToken);
      }
    }

    // Update user's config (undefined fields are left unchanged)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        gitlabUrl,
        gitlabToken,
        autoRefresh: body.autoRefresh,
        refreshInterval: body.refreshInterval,
        theme: body.theme,
        notifyPipelineFailures: body.notifyPipelineFailures,
        notifyPipelineSuccess: body.notifyPipelineSuccess,
        updatedAt: new Date(),
      },
    });

    // Invalidate user cache
    await cacheHelpers.invalidate(`user:${user.id}:config`);

    return NextResponse.json({
      url: updatedUser.gitlabUrl,
      token: updatedUser.gitlabToken ? '***MASKED***' : '',
      tokenConfigured: !!updatedUser.gitlabToken,
      tokenLength: storedTokenLength(updatedUser.gitlabToken, user.id),
      ...(gitlabUsername ? { gitlabUsername } : {}),
      autoRefresh: updatedUser.autoRefresh,
      refreshInterval: updatedUser.refreshInterval,
      theme: updatedUser.theme,
      notifyPipelineFailures: updatedUser.notifyPipelineFailures,
      notifyPipelineSuccess: updatedUser.notifyPipelineSuccess,
    });
  } catch (error) {
    logger.error('Failed to save config', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
