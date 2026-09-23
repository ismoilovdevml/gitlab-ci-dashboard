/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getDoraMetricsSummary } from '@/lib/dora-metrics';

jest.mock('@/lib/dora-metrics', () => ({
  calculateDoraMetrics: jest.fn(),
  getDoraMetricsSummary: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// If the route still consulted the license module, this denial would surface as a 403.
jest.mock('@/lib/license', () => ({
  requireFeature: jest.fn().mockResolvedValue({ error: 'Upgrade required', requiredPlan: 'pro' }),
}));

const mockSummary = getDoraMetricsSummary as jest.Mock;

describe('GET /api/dora/metrics', () => {
  it('returns metrics without a license', async () => {
    mockSummary.mockResolvedValue([{ projectId: 1 }]);

    const req = new NextRequest('http://localhost/api/dora/metrics?projectIds=1,2&period=weekly');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [{ projectId: 1 }] });
    expect(mockSummary).toHaveBeenCalledWith([1, 2], 'weekly');
  });
});
