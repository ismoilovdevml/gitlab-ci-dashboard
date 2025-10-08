import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const jobId = searchParams.get('jobId');
    const filename = searchParams.get('filename') || 'artifacts.zip';

    if (!projectId || !jobId) {
      return NextResponse.json(
        { error: 'Missing projectId or jobId' },
        { status: 400 }
      );
    }

    // Get GitLab config from headers or session
    const gitlabUrl = request.headers.get('x-gitlab-url') || 'https://gitlab.com';
    const gitlabToken = request.headers.get('x-gitlab-token');

    if (!gitlabToken) {
      return NextResponse.json(
        { error: 'GitLab token not found' },
        { status: 401 }
      );
    }

    // Download from GitLab API
    const response = await axios.get(
      `${gitlabUrl}/api/v4/projects/${projectId}/jobs/${jobId}/artifacts`,
      {
        headers: {
          'PRIVATE-TOKEN': gitlabToken,
        },
        responseType: 'arraybuffer',
        maxRedirects: 5,
      }
    );

    // Return the file
    return new NextResponse(response.data, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': response.data.length.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    const err = error as { response?: { data?: { message?: string }; status?: number }; message?: string };
    return NextResponse.json(
      {
        error: err?.response?.data?.message || err?.message || 'Failed to download artifact'
      },
      { status: err?.response?.status || 500 }
    );
  }
}
