import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import prisma from '@/lib/db/prisma';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate cryptographically secure random session token
 * Uses crypto.randomBytes instead of Math.random() for security
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create new session for user
 */
export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          gitlabUrl: true,
          theme: true,
          autoRefresh: true,
          refreshInterval: true,
          notifyPipelineFailures: true,
          notifyPipelineSuccess: true,
        },
      },
    },
  });

  // Update last login time
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return session;
}

/**
 * Get session from cookie
 */
export async function getSession() {
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

  // Use transaction to prevent race conditions (Session Fixation fix)
  const result = await prisma.$transaction(async (tx) => {
    // Check if session exists and is valid
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        // Delete expired session
        await tx.session.delete({ where: { id: session.id } });
      }
      return null;
    }

    // Check if user is active
    if (!session.user.isActive) {
      return null;
    }

    // Update last activity
    await tx.user.update({
      where: { id: session.userId },
      data: { lastActivityAt: new Date() },
    });

    return session;
  });

  return result;
}

/**
 * Delete session (logout)
 * Fixed: Added error handling for session fixation prevention
 */
export async function deleteSession(token: string) {
  try {
    const deleted = await prisma.session.delete({
      where: { token },
    });
    if (!deleted) {
      throw new Error('Session not found');
    }
    return true;
  } catch (error) {
    console.error('Failed to delete session:', error);
    throw new Error('Failed to invalidate session');
  }
}

/**
 * Delete all sessions for user
 */
export async function deleteAllUserSessions(userId: string) {
  await prisma.session.deleteMany({
    where: { userId },
  });
}

/**
 * Cleanup expired sessions (call this periodically)
 */
export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Get current user from session
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Check if user has admin role
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}

/**
 * Require authentication (throw error if not authenticated)
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

/**
 * Require admin role (throw error if not admin)
 */
export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return session;
}
