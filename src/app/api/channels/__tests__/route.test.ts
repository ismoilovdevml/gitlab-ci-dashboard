/**
 * @jest-environment node
 */
import { GET } from '../route';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { cacheHelpers } from '@/lib/db/redis';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/db/redis', () => ({
  cacheHelpers: { getOrSet: jest.fn() },
}));

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;
const mockGetOrSet = cacheHelpers.getOrSet as jest.Mock;

describe('GET /api/channels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns channels without a license', async () => {
    const channels = [{ id: 'c1', type: 'telegram' }];
    mockGetOrgPrisma.mockResolvedValue({
      db: { alertChannel: { findMany: jest.fn() } },
      auth: { user: { id: 'u1' }, organizationId: null },
    });
    mockGetOrSet.mockResolvedValue(channels);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(channels);
  });

  it('keys the channel cache by organization', async () => {
    mockGetOrSet.mockResolvedValue([]);

    mockGetOrgPrisma.mockResolvedValueOnce({ db: {}, auth: { user: { id: 'u1' }, organizationId: 'org-a' } });
    await GET();
    mockGetOrgPrisma.mockResolvedValueOnce({ db: {}, auth: { user: { id: 'u2' }, organizationId: 'org-b' } });
    await GET();

    const keyA = mockGetOrSet.mock.calls[0][0];
    const keyB = mockGetOrSet.mock.calls[1][0];
    expect(keyA).toContain('org-a');
    expect(keyB).toContain('org-b');
    expect(keyA).not.toEqual(keyB);
  });

  it('still returns 401 when unauthenticated', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
