// Server-only: pulls in bcrypt, Prisma and next/headers. Middleware (edge) must not import it.
export { hashPassword, verifyPassword } from './password';
export {
  generateSessionToken,
  createSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  cleanupExpiredSessions,
  isAuthenticated,
  isAdmin,
  getCurrentUser,
} from './session';
// Org-aware helpers: resolve the user's organization alongside the session.
export { getAuth, requireAuth, requireAdmin } from './adapter';
export type { AuthUser, AuthContext } from './types';
