/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getTrendAnalysis, getMultipleTrends } from '@/lib/trend-analysis';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

jest.mock('@/lib/trend-analysis', () => ({
  getTrendAnalysis: jest.fn(),
  getMultipleTrends: jest.fn(),
}));

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockTrend = getTrendAnalysis as jest.Mock;
const mockTrends = getMultipleTrends as jest.Mock;
const mockGetOrgPrisma = getOrgPrisma as jest.Mock;

describe('GET /api/trends', () => {
  const scopedDb = { tag: 'org-a-db' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without a valid session', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: null, auth: null });

    const res = await GET(new NextRequest('http://localhost/api/trends?metric=pipeline_duration'));

    expect(res.status).toBe(401);
    expect(mockTrend).not.toHaveBeenCalled();
    expect(mockTrends).not.toHaveBeenCalled();
  });

  it('queries a single metric through the org-scoped client', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth: { user: { id: 'u1' }, organizationId: 'org-a' } });
    mockTrend.mockResolvedValue({ metric: 'pipeline_duration', data: [] });

    const res = await GET(new NextRequest('http://localhost/api/trends?metric=pipeline_duration&projectId=3'));

    expect(res.status).toBe(200);
    expect(mockTrend).toHaveBeenCalledWith(scopedDb, 'pipeline_duration', 3, undefined, undefined, 100);
  });

  it('queries multiple metrics through the org-scoped client', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth: { user: { id: 'u1' }, organizationId: 'org-a' } });
    mockTrends.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost/api/trends?metrics=a,b'));

    expect(res.status).toBe(200);
    expect(mockTrends).toHaveBeenCalledWith(scopedDb, ['a', 'b'], undefined, undefined, undefined);
  });
});
