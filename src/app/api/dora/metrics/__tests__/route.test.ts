/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import {
  calculateDoraMetrics,
  getDoraMetricsSummary,
  getGitLabDoraReport,
  GitLabRequestError,
} from '@/lib/dora-metrics';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { getUserGitLabCredentials, GitLabCredentialsError } from '@/lib/gitlab/credentials';

jest.mock('@/lib/dora-metrics', () => {
  const actual = jest.requireActual('@/lib/dora-metrics');
  return {
    ...actual,
    calculateDoraMetrics: jest.fn(),
    getDoraMetricsSummary: jest.fn(),
    getGitLabDoraReport: jest.fn(),
  };
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

const mockSummary = getDoraMetricsSummary as jest.Mock;
const mockCalculate = calculateDoraMetrics as jest.Mock;
const mockReport = getGitLabDoraReport as jest.Mock;
const mockCredentials = getUserGitLabCredentials as jest.Mock;
const mockGetOrgPrisma = getOrgPrisma as jest.Mock;

const credentials = { baseUrl: 'https://gitlab.example.com', token: 'glpat-secret' };
const auth = {
  user: { id: 'u1', gitlabUrl: 'https://gitlab.example.com', gitlabToken: 'enc' },
  organizationId: 'org-a',
};

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/dora/metrics${query}`));
}

describe('GET /api/dora/metrics', () => {
  const scopedDb = { tag: 'org-a-db' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrgPrisma.mockResolvedValue({ db: scopedDb, auth });
    mockCredentials.mockReturnValue(credentials);
  });

  it('returns 401 without a valid session and touches no data', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: null, auth: null });

    const res = await get('?period=30d');

    expect(res.status).toBe(401);
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockCalculate).not.toHaveBeenCalled();
  });

  it('computes all-projects metrics from GitLab with the caller credentials, org and user', async () => {
    mockReport.mockResolvedValue({ metrics: { scope: 'all', changeFailureRate: { rate: 10 } }, trends: {} });

    const res = await get('?period=7d');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { scope: 'all', changeFailureRate: { rate: 10 } } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockCredentials).toHaveBeenCalledWith(auth.user);
    expect(mockReport).toHaveBeenCalledWith({
      credentials,
      organizationId: 'org-a',
      userId: 'u1',
      period: '7d',
      projectId: undefined,
    });
  });

  it('defaults to 30 days and passes a single project id', async () => {
    mockReport.mockResolvedValue({ metrics: { scope: 'project' }, trends: {} });

    const res = await get('?projectId=42');

    expect(res.status).toBe(200);
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ period: '30d', projectId: 42 }));
  });

  it.each([['?period=1y'], ['?projectId=abc'], ['?projectId=-3'], ['?projectId=1.5']])(
    'rejects invalid query %s with 400',
    async (query) => {
      const res = await get(query);

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_ERROR');
      expect(mockReport).not.toHaveBeenCalled();
    }
  );

  it('returns 409 with a code when GitLab is not configured', async () => {
    mockCredentials.mockImplementation(() => {
      throw new GitLabCredentialsError('GITLAB_NOT_CONFIGURED');
    });

    const res = await get('?period=30d');

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GITLAB_NOT_CONFIGURED');
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('maps a rejected GitLab token to 502 without leaking it', async () => {
    mockReport.mockRejectedValue(new GitLabRequestError(401, 'GitLab responded 401: projects'));

    const res = await get('?period=30d');
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.code).toBe('GITLAB_AUTH_FAILED');
    expect(JSON.stringify(body)).not.toContain('glpat-secret');
  });

  it('maps an inaccessible single project to 404', async () => {
    mockReport.mockRejectedValue(new GitLabRequestError(404, 'GitLab responded 404: projects/9'));

    const res = await get('?projectId=9');

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('PROJECT_NOT_FOUND');
  });

  it('maps a GitLab timeout to 504', async () => {
    mockReport.mockRejectedValue(new GitLabRequestError(null, 'GitLab request failed: projects'));

    const res = await get('?period=30d');

    expect(res.status).toBe(504);
  });

  it('returns a generic 500 for unexpected errors', async () => {
    mockReport.mockRejectedValue(new Error('boom'));

    const res = await get('?period=30d');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch metrics' });
  });

  describe('source=records (manually recorded deployments and incidents)', () => {
    it('summarises projects through the org-scoped client', async () => {
      mockSummary.mockResolvedValue([{ projectId: 1 }]);

      const res = await get('?source=records&projectIds=1,2&period=weekly');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: [{ projectId: 1 }] });
      expect(mockSummary).toHaveBeenCalledWith(scopedDb, [1, 2], 'weekly');
      expect(mockReport).not.toHaveBeenCalled();
    });

    it('passes the org-scoped client to calculateDoraMetrics', async () => {
      mockCalculate.mockResolvedValue({ projectId: 7 });

      const res = await get('?source=records&projectId=7&startDate=2024-01-01&endDate=2024-02-01');

      expect(res.status).toBe(200);
      expect(mockCalculate.mock.calls[0][0]).toBe(scopedDb);
      expect(mockCalculate.mock.calls[0][1]).toBe(7);
    });

    it('requires a project and a date range', async () => {
      const res = await get('?source=records&startDate=2024-01-01&endDate=2024-02-01');

      expect(res.status).toBe(400);
      expect(mockCalculate).not.toHaveBeenCalled();
    });
  });
});
