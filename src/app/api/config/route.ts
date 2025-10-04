import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { getCurrentUser } from '@/lib/auth';

// GET /api/config - Get user's GitLab configuration
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Return user's config
    return NextResponse.json({
      url: user.gitlabUrl,
      token: user.gitlabToken,
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

    return NextResponse.json({
      url: updatedUser.gitlabUrl,
      token: updatedUser.gitlabToken,
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
