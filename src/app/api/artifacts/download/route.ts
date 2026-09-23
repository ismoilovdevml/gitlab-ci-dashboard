import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const jobId = searchParams.get('jobId');
    const rawFilename = searchParams.get('filename') || 'artifacts.zip';

    // SECURITY FIX: Validate that projectId and jobId are valid integers
    if (!projectId || !jobId) {
      return NextResponse.json(
        { error: 'Missing projectId or jobId' },
        { status: 400 }
      );
    }

    const projectIdNum = parseInt(projectId, 10);
    const jobIdNum = parseInt(jobId, 10);

    if (!Number.isInteger(projectIdNum) || projectIdNum <= 0 || !Number.isInteger(jobIdNum) || jobIdNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid projectId or jobId - must be positive integers' },
        { status: 400 }
      );
    }

    // SECURITY FIX: Sanitize filename to prevent path traversal
    const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // SECURITY FIX: Don't accept GitLab URL/token from headers
    // Should come from authenticated user's config
    const { getCurrentUser } = await import('@/lib/auth');
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - please login' },
        { status: 401 }
      );
    }

    const gitlabUrl = user.gitlabUrl || 'https://gitlab.com';
    const gitlabToken = user.gitlabToken;

    if (!gitlabToken) {
      return NextResponse.json(
        { error: 'GitLab token not found' },
        { status: 401 }
      );
    }

    // Download from GitLab API with validated IDs
    const response = await axios.get(
      `${gitlabUrl}/api/v4/projects/${projectIdNum}/jobs/${jobIdNum}/artifacts`,
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
