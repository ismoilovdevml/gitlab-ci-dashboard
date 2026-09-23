/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET, DELETE } from '../route';
import { GET as GET_ANALYTICS } from '../analytics/route';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { redis, cacheHelpers } from '@/lib/db/redis';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/db/redis', () => ({
  redis: { get: jest.fn(), setex: jest.fn() },
  cacheHelpers: { invalidate: jest.fn() },
}));

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockInvalidate = cacheHelpers.invalidate as jest.Mock;

function authFor(organizationId: string) {
  return {
    db: { alertHistory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } },
    auth: { user: { id: `user-${organizationId}` }, organizationId },
  };
}

describe('history cache keys are org-scoped', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(JSON.stringify({ cached: true }));
  });

  it('GET /api/history reads a different cache key per organization', async () => {
    mockGetOrgPrisma.mockResolvedValueOnce(authFor('org-a'));
    await GET(new NextRequest('http://localhost/api/history'));
    mockGetOrgPrisma.mockResolvedValueOnce(authFor('org-b'));
    await GET(new NextRequest('http://localhost/api/history'));

    const [keyA] = mockRedisGet.mock.calls[0];
    const [keyB] = mockRedisGet.mock.calls[1];
    expect(keyA).toContain('org-a');
    expect(keyB).toContain('org-b');
    expect(keyA).not.toEqual(keyB);
  });

  it('DELETE /api/history invalidates only the caller org keys', async () => {
    mockGetOrgPrisma.mockResolvedValueOnce(authFor('org-a'));

    await DELETE(csrfRequest('http://localhost/api/history', 'DELETE', 'valid'));

    expect(mockInvalidate).toHaveBeenCalledWith('history:org-a:*');
  });

  it('GET /api/history/analytics reads a key under the org history prefix', async () => {
    mockGetOrgPrisma.mockResolvedValueOnce(authFor('org-a'));

    const res = await GET_ANALYTICS(new NextRequest('http://localhost/api/history/analytics?days=7'));

    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith('history:org-a:analytics:7');
  });
});
