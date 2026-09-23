/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { POST as LOGIN } from '../login/route';
import { POST as LOGOUT } from '../logout/route';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
};

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  get default() {
    return mockPrisma;
  },
  get prisma() {
    return mockPrisma;
  },
}));

const mockVerifyPassword = jest.fn();
const mockCreateSession = jest.fn();
const mockDeleteSession = jest.fn();
jest.mock('@/lib/auth', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 4, reset: Date.now() }),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: () => ({ value: 'old-session-token' }),
  }),
}));

function loginRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'admin', password: 'correct-password' }),
  });
}

describe('session cookie', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      theme: 'dark',
      isActive: true,
      password: 'hash',
    });
    mockPrisma.user.update.mockResolvedValue({});
    mockVerifyPassword.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue({ token: 'new-session-token' });
  });

  it('sets an httpOnly session cookie on login', async () => {
    const res = await LOGIN(loginRequest('http://localhost/api/auth/login'));

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe(
      'gitlab_dashboard_session=new-session-token; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax'
    );
  });

  it('marks the login cookie Secure behind an HTTPS proxy', async () => {
    const res = await LOGIN(
      loginRequest('http://localhost/api/auth/login', { 'x-forwarded-proto': 'https' })
    );

    expect(res.headers.get('set-cookie')).toContain('; Secure');
  });

  it('expires the session cookie on logout', async () => {
    const res = await LOGOUT(csrfRequest('http://localhost/api/auth/logout', 'POST', 'valid'));

    expect(res.status).toBe(200);
    expect(mockDeleteSession).toHaveBeenCalledWith('old-session-token');
    expect(res.headers.get('set-cookie')).toBe(
      'gitlab_dashboard_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'
    );
  });
});
