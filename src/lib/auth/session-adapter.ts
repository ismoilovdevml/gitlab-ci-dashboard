import { cookies } from 'next/headers';
import prisma from '@/lib/db/prisma';
import { AuthUser } from './types';

const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

/**
 * Session-based auth adapter for self-hosted mode.
 * Reads session token from cookie, validates against database.
 */
export async function getSessionAuth(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          gitlabUrl: true,
          gitlabToken: true,
          theme: true,
          autoRefresh: true,
          refreshInterval: true,
          notifyPipelineFailures: true,
          notifyPipelineSuccess: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  // Update last activity (fire-and-forget)
  prisma.user.update({
    where: { id: session.userId },
    data: { lastActivityAt: new Date() },
  }).catch(() => {});

  return {
    id: session.user.id,
    username: session.user.username,
    email: session.user.email,
    role: session.user.role,
    isActive: session.user.isActive,
    gitlabUrl: session.user.gitlabUrl,
    gitlabToken: session.user.gitlabToken,
    organizationId: null, // Resolved by adapter.ts
    theme: session.user.theme,
    autoRefresh: session.user.autoRefresh,
    refreshInterval: session.user.refreshInterval,
    notifyPipelineFailures: session.user.notifyPipelineFailures,
    notifyPipelineSuccess: session.user.notifyPipelineSuccess,
  };
}
