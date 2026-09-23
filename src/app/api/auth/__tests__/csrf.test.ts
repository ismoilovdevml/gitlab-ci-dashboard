/**
 * @jest-environment node
 */
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { POST as CHANGE_PASSWORD } from '../change-password/route';
import { POST as LOGOUT } from '../logout/route';

const mockPrisma = {
  session: { findUnique: jest.fn() },
  user: { update: jest.fn() },
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

const mockDeleteSession = jest.fn();
jest.mock('@/lib/auth', () => ({
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: () => ({ value: 'test-session-token' }),
  }),
}));

describe('/api/auth CSRF enforcement', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.session.findUnique.mockResolvedValue(null);
  });

  describe('POST /api/auth/change-password', () => {
    const url = 'http://localhost/api/auth/change-password';
    const body = { currentPassword: 'old-password', newPassword: 'new-password-123' };

    it.each(REJECTED_MODES)('rejects a %s CSRF token with 403', async (mode) => {
      const res = await CHANGE_PASSWORD(csrfRequest(url, 'POST', mode, body));

      expect(res.status).toBe(403);
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('passes a valid CSRF token through to the handler', async () => {
      const res = await CHANGE_PASSWORD(csrfRequest(url, 'POST', 'valid', body));

      expect(mockPrisma.session.findUnique).toHaveBeenCalled();
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    const url = 'http://localhost/api/auth/logout';

    it.each(REJECTED_MODES)('rejects a %s CSRF token with 403 and keeps the session', async (mode) => {
      const res = await LOGOUT(csrfRequest(url, 'POST', mode));

      expect(res.status).toBe(403);
      expect(mockDeleteSession).not.toHaveBeenCalled();
    });

    it('logs out with a valid CSRF token', async () => {
      const res = await LOGOUT(csrfRequest(url, 'POST', 'valid'));

      expect(res.status).toBe(200);
      expect(mockDeleteSession).toHaveBeenCalledWith('test-session-token');
    });
  });
});
