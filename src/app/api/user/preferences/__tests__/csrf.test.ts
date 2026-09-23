/**
 * @jest-environment node
 */
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { PUT } from '../route';

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

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: () => ({ value: 'test-session-token' }),
  }),
}));

describe('PUT /api/user/preferences CSRF enforcement', () => {
  const url = 'http://localhost/api/user/preferences';
  const body = { theme: 'dark' };

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.session.findUnique.mockResolvedValue(null);
  });

  it.each(REJECTED_MODES)('rejects a %s CSRF token with 403', async (mode) => {
    const res = await PUT(csrfRequest(url, 'PUT', mode, body));

    expect(res.status).toBe(403);
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('passes a valid CSRF token through to the handler', async () => {
    const res = await PUT(csrfRequest(url, 'PUT', 'valid', body));

    expect(mockPrisma.session.findUnique).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});
