import { AuthUser, AuthContext, getAuthMode } from './types';
import { getSessionAuth } from './session-adapter';
import { getSupabaseAuth } from './supabase-adapter';
import { getDefaultOrg } from '@/lib/org/scope';

/**
 * Get the current authenticated user using the appropriate auth adapter.
 * Returns null if not authenticated.
 *
 * Usage in API routes:
 *   const auth = await getAuth();
 *   if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   // auth.user, auth.organizationId available
 */
export async function getAuth(): Promise<AuthContext | null> {
  const mode = getAuthMode();

  let user: AuthUser | null = null;

  if (mode === 'supabase') {
    user = await getSupabaseAuth();
  } else {
    user = await getSessionAuth();
  }

  if (!user) return null;

  // Resolve organization context
  let organizationId = user.organizationId;
  if (!organizationId) {
    const defaultOrg = await getDefaultOrg(user.id);
    organizationId = defaultOrg?.id ?? null;
  }

  return {
    user: { ...user, organizationId },
    organizationId,
  };
}

/**
 * Require authentication. Returns AuthContext or throws.
 */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Unauthorized');
  }
  return auth;
}

/**
 * Require admin role. Returns AuthContext or throws.
 */
export async function requireAdmin(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (auth.user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return auth;
}

/**
 * Get current user (convenience wrapper, matches old API).
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const auth = await getAuth();
  return auth?.user ?? null;
}
