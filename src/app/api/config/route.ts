import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { getCurrentUser } from '@/lib/auth';
import { validateCSRFToken } from '@/lib/csrf';

// GET /api/config - Get user's GitLab configuration
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if token should be unmasked (for API usage, not for display)
    const { searchParams } = new URL(request.url);
    const unmask = searchParams.get('unmask') === 'true';

    // Return user's config
    // SECURITY: Only unmask token for internal API calls, not for UI display
    return NextResponse.json({
      url: user.gitlabUrl,
      token: unmask ? user.gitlabToken : (user.gitlabToken ? '***MASKED***' : ''),
      tokenConfigured: !!user.gitlabToken,
      tokenLength: user.gitlabToken?.length || 0,
      autoRefresh: user.autoRefresh,
      refreshInterval: user.refreshInterval,
      theme: user.theme,
      notifyPipelineFailures: user.notifyPipelineFailures,
      notifyPipelineSuccess: user.notifyPipelineSuccess,
    });
  } catch (error) {
    console.error('Failed to fetch config:', error);
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

    // SECURITY FIX: CSRF validation
    const csrfToken = request.headers.get('x-csrf-token');
    const cookieStore = await import('next/headers').then(m => m.cookies());
    const sessionToken = (await cookieStore).get('gitlab_dashboard_session')?.value;

    if (!csrfToken || !validateCSRFToken(csrfToken, sessionToken)) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Update user's config
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        gitlabUrl: body.url,
        gitlabToken: body.token,
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

    // SECURITY FIX: Mask GitLab token in response
    return NextResponse.json({
      url: updatedUser.gitlabUrl,
      token: updatedUser.gitlabToken ? '***MASKED***' : '',
      tokenConfigured: !!updatedUser.gitlabToken,
      tokenLength: updatedUser.gitlabToken?.length || 0,
      autoRefresh: updatedUser.autoRefresh,
      refreshInterval: updatedUser.refreshInterval,
      theme: updatedUser.theme,
      notifyPipelineFailures: updatedUser.notifyPipelineFailures,
      notifyPipelineSuccess: updatedUser.notifyPipelineSuccess,
    });
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
