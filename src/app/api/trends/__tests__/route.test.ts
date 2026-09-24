/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getTrendAnalysis, getMultipleTrends } from '@/lib/trend-analysis';
import { getGitLabDoraReport, GitLabRequestError } from '@/lib/dora-metrics';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { getUserGitLabCredentials, GitLabCredentialsError } from '@/lib/gitlab/credentials';

jest.mock('@/lib/trend-analysis', () => {
  const actual = jest.requireActual('@/lib/trend-analysis');
  return { ...actual, getTrendAnalysis: jest.fn(), getMultipleTrends: jest.fn() };
});

jest.mock('@/lib/dora-metrics', () => {
  const actual = jest.requireActual('@/lib/dora-metrics');
  return { ...actual, getGitLabDoraReport: jest.fn() };
});

jest.mock('@/lib/gitlab/credentials', () => {
  const actual = jest.requireActual('@/lib/gitlab/credentials');
  return { ...actual, getUserGitLabCredentials: jest.fn() };
});

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockTrend = getTrendAnalysis as jest.Mock;
const mockTrends = getMultipleTrends as jest.Mock;
const mockReport = getGitLabDoraReport as jest.Mock;
const mockCredentials = getUserGitLabCredentials as jest.Mock;
const mockGetOrgPrisma = getOrgPrisma as jest.Mock;

const credentials = { baseUrl: 'https://gitlab.example.com', token: 'glpat-secret' };
const auth = { user: { id: 'u1' }, organizationId: 'org-a' };

const trend = (metric: string) => ({
  metric,
  data: [{ timestamp: '2026-09-01T00:00:00.000Z', value: 3 }],
  trend: 'stable',
  changePercent: 0,
});
const report = {
  metrics: {},
  trends: {
    deployment_frequency: trend('deployment_frequency'),
    lead_time: trend('lead_time'),
    success_rate: trend('success_rate'),
  },
};

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/trends${query}`));
}

describe('GET /api/trends', () => {
  const scopedDb = { tag: 'org-a-db' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth });
    mockCredentials.mockReturnValue(credentials);
    mockReport.mockResolvedValue(report);
  });

  it('returns 401 without a valid session', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: null, auth: null });

    const res = await get('?metric=pipeline_duration');

    expect(res.status).toBe(401);
    expect(mockTrend).not.toHaveBeenCalled();
    expect(mockTrends).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('returns DORA trends keyed by metric name, computed from GitLab', async () => {
    const res = await get('?metrics=deployment_frequency,lead_time,success_rate&period=7d&projectId=5');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(['deployment_frequency', 'lead_time', 'success_rate']);
    expect(body.data.deployment_frequency.data).toEqual([{ timestamp: '2026-09-01T00:00:00.000Z', value: 3 }]);
    expect(mockReport).toHaveBeenCalledWith({
      credentials,
      organizationId: 'org-a',
      userId: 'u1',
      period: '7d',
      projectId: 5,
    });
    expect(mockTrends).not.toHaveBeenCalled();
  });

  it('returns a single DORA trend for metric=', async () => {
    const res = await get('?metric=lead_time');

    expect(res.status).toBe(200);
    expect((await res.json()).data.metric).toBe('lead_time');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ period: '30d', projectId: undefined }));
  });

  it('queries a single recorded metric through the org-scoped client', async () => {
    mockTrend.mockResolvedValue({ metric: 'pipeline_duration', data: [] });

    const res = await get('?metric=pipeline_duration&projectId=3');

    expect(res.status).toBe(200);
    expect(mockTrend).toHaveBeenCalledWith(scopedDb, 'pipeline_duration', 3, undefined, undefined, 100);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('merges recorded and GitLab metrics into one keyed object', async () => {
    mockTrends.mockResolvedValue({ pipeline_duration: trend('pipeline_duration') });

    const res = await get('?metrics=pipeline_duration,success_rate&startDate=2026-09-01&endDate=2026-09-10');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(['pipeline_duration', 'success_rate']);
    expect(mockTrends).toHaveBeenCalledWith(
      scopedDb,
      ['pipeline_duration'],
      undefined,
      new Date('2026-09-01'),
      new Date('2026-09-10')
    );
  });

  it.each([[''], ['?metrics='], ['?metric=DROP TABLE'], ['?metrics=a&period=2w'], ['?metric=a&startDate=nope']])(
    'rejects invalid query %s with 400',
    async (query) => {
      const res = await get(query);

      expect(res.status).toBe(400);
      expect(mockReport).not.toHaveBeenCalled();
      expect(mockTrends).not.toHaveBeenCalled();
    }
  );

  it('reports missing GitLab configuration for DORA trends', async () => {
    mockCredentials.mockImplementation(() => {
      throw new GitLabCredentialsError('GITLAB_NOT_CONFIGURED');
    });

    const res = await get('?metrics=deployment_frequency');

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GITLAB_NOT_CONFIGURED');
  });

  it('maps GitLab errors for DORA trends', async () => {
    mockReport.mockRejectedValue(new GitLabRequestError(500, 'GitLab responded 500: projects'));

    const res = await get('?metrics=deployment_frequency');

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('GITLAB_ERROR');
  });
});
