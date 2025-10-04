import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        gitlabUrl: user.gitlabUrl,
        gitlabToken: user.gitlabToken ? '***' : '', // Hide token, just show if exists
        theme: user.theme,
        autoRefresh: user.autoRefresh,
        refreshInterval: user.refreshInterval,
        notifyPipelineFailures: user.notifyPipelineFailures,
        notifyPipelineSuccess: user.notifyPipelineSuccess,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
