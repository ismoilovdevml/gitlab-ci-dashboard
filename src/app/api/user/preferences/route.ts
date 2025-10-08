import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

// GET /api/user/preferences - Get user preferences
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      console.error('[Preferences API] No session cookie found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Find session and user
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const user = session.user;

    // Return user preferences
    return NextResponse.json({
      theme: user.theme,
      autoRefresh: user.autoRefresh,
      refreshInterval: user.refreshInterval,
      notifyPipelineFailures: user.notifyPipelineFailures,
      notifyPipelineSuccess: user.notifyPipelineSuccess,
      activeTab: user.activeTab || 'overview',
    });
  } catch (error) {
    console.error('Failed to get user preferences:', error);
    return NextResponse.json(
      { error: 'Failed to get preferences' },
      { status: 500 }
    );
  }
}

// PUT /api/user/preferences - Update user preferences
export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      console.error('[Preferences API] No session cookie found for PUT');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Find session
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
    });

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const body = await request.json();
    const {
      theme,
      autoRefresh,
      refreshInterval,
      notifyPipelineFailures,
      notifyPipelineSuccess,
      activeTab,
    } = body;

    // Update user preferences
    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(theme !== undefined && { theme }),
        ...(autoRefresh !== undefined && { autoRefresh }),
        ...(refreshInterval !== undefined && { refreshInterval }),
        ...(notifyPipelineFailures !== undefined && { notifyPipelineFailures }),
        ...(notifyPipelineSuccess !== undefined && { notifyPipelineSuccess }),
        ...(activeTab !== undefined && { activeTab }),
        lastActivityAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        theme: updatedUser.theme,
        autoRefresh: updatedUser.autoRefresh,
        refreshInterval: updatedUser.refreshInterval,
        notifyPipelineFailures: updatedUser.notifyPipelineFailures,
        notifyPipelineSuccess: updatedUser.notifyPipelineSuccess,
        activeTab: updatedUser.activeTab,
      },
    });
  } catch (error) {
    console.error('Failed to update user preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
