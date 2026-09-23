/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';
import { prisma } from '@/lib/db/prisma';
import { cookies } from 'next/headers';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    session: { findUnique: jest.fn() },
    user: { update: jest.fn() },
  },
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  requireCsrf: jest.fn(() => null),
}));

const mockCookies = cookies as jest.Mock;
const mockFindSession = prisma.session.findUnique as jest.Mock;
const mockUpdateUser = prisma.user.update as jest.Mock;

const USER_ID = 'user-secret-id-123';

function withSessionCookie(value?: string) {
  mockCookies.mockResolvedValue({
    get: () => (value ? { value } : undefined),
  });
}

function putRequest(body: unknown) {
  return new NextRequest('http://localhost/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/user/preferences logging', () => {
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    jest.clearAllMocks();
    spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
  });

  it('returns 401 without logging when no session cookie is present', async () => {
    withSessionCookie();

    const res = await GET();

    expect(res.status).toBe(401);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('updates preferences without logging the user id or session token', async () => {
    withSessionCookie('session-token-abc');
    mockFindSession.mockResolvedValue({
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockUpdateUser.mockResolvedValue({
      theme: 'dark',
      autoRefresh: true,
      refreshInterval: 30,
      notifyPipelineFailures: true,
      notifyPipelineSuccess: false,
    });

    const res = await PUT(putRequest({ theme: 'dark' }));

    expect(res.status).toBe(200);
    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain('session-token-abc');
  });

  it('logs failures through the structured logger', async () => {
    withSessionCookie('session-token-abc');
    mockFindSession.mockRejectedValue(new Error('db down'));

    const res = await GET();

    expect(res.status).toBe(500);
    const errorSpy = spies[3];
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.stringify(errorSpy.mock.calls);
    expect(output).toContain('Failed to get user preferences');
    expect(output).toContain('db down');
    expect(output).not.toContain('session-token-abc');
  });
});
