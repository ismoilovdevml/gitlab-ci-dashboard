/**
 * Normalized user object returned by all auth adapters.
 * Provides a consistent interface for authenticated users.
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
