/**
 * Normalized user object returned by all auth adapters.
 * Provides a consistent interface regardless of auth mode (session vs JWT).
 */
export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  role: string; // admin, user, viewer
  isActive: boolean;
  gitlabUrl: string;
  gitlabToken: string;
  organizationId: string | null;
  theme: string;
  autoRefresh: boolean;
  refreshInterval: number;
  notifyPipelineFailures: boolean;
  notifyPipelineSuccess: boolean;
}

/**
 * Auth context returned after successful authentication.
 */
export interface AuthContext {
  user: AuthUser;
  organizationId: string | null;
}

/**
 * Auth mode: self-hosted uses session cookies, cloud uses Supabase JWT.
 */
export type AuthMode = 'session' | 'supabase';

export function getAuthMode(): AuthMode {
  return (process.env.AUTH_MODE as AuthMode) || 'session';
}
