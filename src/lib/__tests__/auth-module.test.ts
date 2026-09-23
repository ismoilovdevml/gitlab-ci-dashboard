/**
 * @jest-environment node
 */
import * as auth from '@/lib/auth';

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

describe('@/lib/auth module surface', () => {
  it.each([
    'hashPassword',
    'verifyPassword',
    'generateSessionToken',
    'createSession',
    'getSession',
    'deleteSession',
    'deleteAllUserSessions',
    'cleanupExpiredSessions',
    'isAuthenticated',
    'isAdmin',
    'getCurrentUser',
    'getAuth',
    'requireAuth',
    'requireAdmin',
  ])('exports %s', (name) => {
    expect(typeof (auth as Record<string, unknown>)[name]).toBe('function');
  });
});
