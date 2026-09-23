// Auth adapter - unified interface for session auth
export { getAuth, requireAuth, requireAdmin, getCurrentUser } from './adapter';
export type { AuthUser, AuthContext } from './types';
