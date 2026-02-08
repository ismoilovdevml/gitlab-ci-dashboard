// Auth adapter - unified interface for session and JWT auth
export { getAuth, requireAuth, requireAdmin, getCurrentUser } from './adapter';
export type { AuthUser, AuthContext, AuthMode } from './types';
export { getAuthMode } from './types';
