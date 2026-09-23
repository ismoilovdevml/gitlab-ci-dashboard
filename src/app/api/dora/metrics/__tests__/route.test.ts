/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { calculateDoraMetrics, getDoraMetricsSummary } from '@/lib/dora-metrics';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

jest.mock('@/lib/dora-metrics', () => ({
  calculateDoraMetrics: jest.fn(),
  getDoraMetricsSummary: jest.fn(),
}));

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockSummary = getDoraMetricsSummary as jest.Mock;
const mockCalculate = calculateDoraMetrics as jest.Mock;
const mockGetOrgPrisma = getOrgPrisma as jest.Mock;

describe('GET /api/dora/metrics', () => {
  const scopedDb = { tag: 'org-a-db' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without a valid session and touches no data', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: null, auth: null });

    const res = await GET(
      new NextRequest('http://localhost/api/dora/metrics?projectId=1&startDate=2024-01-01&endDate=2024-02-01')
    );

    expect(res.status).toBe(401);
    expect(mockCalculate).not.toHaveBeenCalled();
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('returns metrics without a license, using the org-scoped client', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth: { user: { id: 'u1' }, organizationId: 'org-a' } });
    mockSummary.mockResolvedValue([{ projectId: 1 }]);

    const res = await GET(new NextRequest('http://localhost/api/dora/metrics?projectIds=1,2&period=weekly'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [{ projectId: 1 }] });
    expect(mockSummary).toHaveBeenCalledWith(scopedDb, [1, 2], 'weekly');
  });

  it('passes the org-scoped client to calculateDoraMetrics', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth: { user: { id: 'u1' }, organizationId: 'org-a' } });
    mockCalculate.mockResolvedValue({ projectId: 7 });

    const res = await GET(
      new NextRequest('http://localhost/api/dora/metrics?projectId=7&startDate=2024-01-01&endDate=2024-02-01')
    );

    expect(res.status).toBe(200);
    expect(mockCalculate.mock.calls[0][0]).toBe(scopedDb);
  });
});
