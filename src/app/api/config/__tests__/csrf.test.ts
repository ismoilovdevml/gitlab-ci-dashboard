/**
 * @jest-environment node
 */
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { POST } from '../route';

const mockPrisma = { user: { update: jest.fn() } };

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  get default() {
    return mockPrisma;
  },
  get prisma() {
    return mockPrisma;
  },
}));

jest.mock('@/lib/db/redis', () => ({
  cacheHelpers: { invalidate: jest.fn() },
}));

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({ id: 'u1' }),
}));

jest.mock('@/lib/gitlab/token', () => ({
  ...jest.requireActual('@/lib/gitlab/token'),
  testGitLabConnection: jest.fn().mockResolvedValue({ success: true, username: 'root' }),
}));

describe('POST /api/config CSRF enforcement', () => {
  const url = 'http://localhost/api/config';
  const body = { url: 'https://gitlab.example.com', token: 'glpat-x' };

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({ gitlabUrl: body.url, gitlabToken: body.token });
  });

  it.each(REJECTED_MODES)('rejects a %s CSRF token with 403', async (mode) => {
    const res = await POST(csrfRequest(url, 'POST', mode, body));

    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('saves the config with a valid CSRF token', async () => {
    const res = await POST(csrfRequest(url, 'POST', 'valid', body));

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect((await res.json()).token).toBe('***MASKED***');
  });
});
