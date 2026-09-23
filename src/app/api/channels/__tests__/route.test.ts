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

// If the route still consulted the license module, this denial would surface as a 403.
jest.mock('@/lib/license', () => ({
  requireFeature: jest.fn().mockResolvedValue({ error: 'Upgrade required', requiredPlan: 'pro' }),
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

  it('still returns 401 when unauthenticated', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
