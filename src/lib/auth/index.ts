// Server-only: pulls in bcrypt, Prisma and next/headers. The proxy (src/proxy.ts) runs on
// Node.js but only checks the session cookie, so it deliberately does not import this module.
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
