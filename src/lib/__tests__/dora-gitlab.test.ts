/**
 * @jest-environment node
 */
import {
  computeDoraTrends,
  computeDoraValues,
  computeGitLabDoraReport,
  describeDoraError,
  doraCacheKey,
  getGitLabDoraReport,
  GitLabRequestError,
  isProductionEnvironment,
  trendBucketMs,
  type DeliveryEvent,
  type DoraWindow,
} from '@/lib/dora-metrics';
import { GitLabCredentialsError } from '@/lib/gitlab/credentials';
import { redis } from '@/lib/db/redis';

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/db/redis', () => ({
  redis: { get: jest.fn(), setex: jest.fn() },
}));

const mockRedis = redis as unknown as { get: jest.Mock; setex: jest.Mock };

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const WINDOW: DoraWindow = { start: NOW - 7 * DAY, end: NOW };

function ev(partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'status' | 'finishedAt'>): DeliveryEvent {
  return { stream: 's1', commitAt: null, ...partial };
}

describe('computeDoraValues', () => {
  it('returns nulls and no ratings when there are no deliveries', () => {
    const values = computeDoraValues([], WINDOW);

    expect(values).toEqual({
      deploymentFrequency: { perDay: null, count: 0, rating: null },
      leadTime: { medianSeconds: null, averageSeconds: null, samples: 0, rating: null },
      mttr: { averageSeconds: null, recoveries: 0, rating: null },
      changeFailureRate: { rate: null, failed: 0, total: 0, rating: null },
    });
  });

  it('ignores deliveries outside the window', () => {
    const values = computeDoraValues([ev({ status: 'success', finishedAt: WINDOW.start - 1 })], WINDOW);

    expect(values.deploymentFrequency.perDay).toBeNull();
  });

  it('computes frequency, lead time, change failure rate and MTTR', () => {
    const t0 = WINDOW.start + DAY;
    const events: DeliveryEvent[] = [
      ev({ status: 'success', finishedAt: t0, commitAt: t0 - 2 * HOUR }),
      ev({ status: 'failed', finishedAt: t0 + 1 * HOUR, commitAt: t0 }),
      ev({ status: 'failed', finishedAt: t0 + 2 * HOUR }),
      // Recovers the outage that started at t0 + 1h: 3h.
      ev({ status: 'success', finishedAt: t0 + 4 * HOUR, commitAt: t0 + 3 * HOUR }),
      ev({ status: 'success', finishedAt: t0 + 10 * HOUR, commitAt: t0 + 6 * HOUR }),
    ];

    const values = computeDoraValues(events, WINDOW);

    expect(values.deploymentFrequency).toEqual({ perDay: round3(3 / 7), count: 3, rating: 'high' });
    // Lead times 2h, 1h, 4h → median 2h.
    expect(values.leadTime).toMatchObject({ medianSeconds: 7200, samples: 3, rating: 'high' });
    expect(values.leadTime.averageSeconds).toBe(Math.round((7 * 3600) / 3));
    expect(values.changeFailureRate).toEqual({ rate: 40, failed: 2, total: 5, rating: 'medium' });
    expect(values.mttr).toEqual({ averageSeconds: 3 * 3600, recoveries: 1, rating: 'high' });
  });

  it('only lets a success on the same stream recover a failure', () => {
    const t0 = WINDOW.start + DAY;
    const events: DeliveryEvent[] = [
      ev({ stream: 'prod-a', status: 'failed', finishedAt: t0 }),
      ev({ stream: 'prod-b', status: 'success', finishedAt: t0 + HOUR }),
      ev({ stream: 'prod-a', status: 'success', finishedAt: t0 + 30 * 60 * 1000 }),
    ];

    expect(computeDoraValues(events, WINDOW).mttr).toEqual({ averageSeconds: 1800, recoveries: 1, rating: 'elite' });
  });

  it('keeps MTTR null while a failure is not recovered', () => {
    const values = computeDoraValues([ev({ status: 'failed', finishedAt: WINDOW.start + DAY })], WINDOW);

    expect(values.mttr.averageSeconds).toBeNull();
    expect(values.changeFailureRate.rate).toBe(100);
    // Deliveries happened, so frequency is a real zero rather than missing data.
    expect(values.deploymentFrequency).toEqual({ perDay: 0, count: 0, rating: 'low' });
  });

  it('skips lead time when the commit time is unknown or after the delivery', () => {
    const t = WINDOW.start + DAY;
    const values = computeDoraValues(
      [ev({ status: 'success', finishedAt: t }), ev({ status: 'success', finishedAt: t, commitAt: t + HOUR })],
      WINDOW
    );

    expect(values.leadTime.medianSeconds).toBeNull();
    expect(values.leadTime.rating).toBeNull();
  });
});

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

describe('computeDoraTrends', () => {
  it('returns empty series without deliveries', () => {
    const trends = computeDoraTrends([], WINDOW);

    expect(trends.deployment_frequency.data).toEqual([]);
    expect(trends.lead_time.data).toEqual([]);
    expect(trends.success_rate.data).toEqual([]);
  });

  it('buckets per day and omits empty buckets for lead time and success rate', () => {
    const events = [
      ev({ status: 'success', finishedAt: WINDOW.start + 2 * HOUR, commitAt: WINDOW.start }),
      ev({ status: 'failed', finishedAt: WINDOW.start + 3 * HOUR }),
      ev({ status: 'success', finishedAt: WINDOW.end, commitAt: WINDOW.end - 4 * HOUR }),
    ];

    const trends = computeDoraTrends(events, WINDOW);

    expect(trends.deployment_frequency.data).toHaveLength(7);
    expect(trends.deployment_frequency.data[0]).toEqual({ timestamp: new Date(WINDOW.start).toISOString(), value: 1 });
    // The delivery exactly at the window end lands in the last bucket.
    expect(trends.deployment_frequency.data[6].value).toBe(1);
    expect(trends.lead_time.data.map((p) => p.value)).toEqual([2, 4]);
    expect(trends.success_rate.data.map((p) => p.value)).toEqual([50, 100]);
    expect(trends.success_rate.trend).toBe('increasing');
    expect(trends.success_rate.changePercent).toBe(100);
  });

  it('uses weekly buckets for 90 days', () => {
    expect(trendBucketMs({ start: 0, end: 90 * DAY })).toBe(7 * DAY);
    expect(trendBucketMs({ start: 0, end: 30 * DAY })).toBe(DAY);
  });
});

describe('isProductionEnvironment', () => {
  it.each([
    [{ id: 1, name: 'production', tier: 'production' }, true],
    [{ id: 1, name: 'prod-eu', tier: 'production' }, true],
    [{ id: 1, name: 'production', tier: 'staging' }, false],
    [{ id: 1, name: 'staging', tier: 'staging' }, false],
    [{ id: 1, name: 'production' }, true],
    [{ id: 1, name: 'prod/eu' }, true],
    [{ id: 1, name: 'product-review' }, false],
    [{ id: 1, name: 'review/feature' }, false],
  ])('%j → %s', (env, expected) => {
    expect(isProductionEnvironment(env)).toBe(expected);
  });
});

// --- GitLab integration ----------------------------------------------------

type Route = (url: URL) => { status?: number; body: unknown; nextPage?: number } | undefined;

const credentials = { baseUrl: 'https://gitlab.example.com', token: 'glpat-secret' };
const iso = (t: number) => new Date(t).toISOString();

let fetchMock: jest.Mock;

function installGitLab(route: Route) {
  fetchMock = jest.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const hit = route(url);
    if (!hit) return new Response(JSON.stringify({ message: '404 Not found' }), { status: 404 });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (hit.nextPage) headers['x-next-page'] = String(hit.nextPage);
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

const t = (hoursAfterStart: number) => WINDOW.start + hoursAfterStart * HOUR;

function deployment(id: number, status: string, finished: number, commit: number | null) {
  return {
    id,
    status,
    updated_at: iso(finished + 1000),
    finished_at: iso(finished),
    deployable: { finished_at: iso(finished), commit: commit === null ? null : { created_at: iso(commit) } },
  };
}

/** Project 1 deploys to production; project 2 has no environments and falls back to pipelines. */
function standardGitLab(url: URL) {
  const path = url.pathname.replace('/api/v4/', '');
  if (path === 'projects') {
    return {
      body: [
        { id: 1, name: 'web', default_branch: 'main' },
        { id: 2, name: 'api', default_branch: 'trunk' },
      ],
    };
  }
  if (path === 'projects/1') return { body: { id: 1, name: 'web', default_branch: 'main' } };
  if (path === 'projects/1/environments') {
    return { body: [{ id: 10, name: 'production', tier: 'production' }, { id: 11, name: 'staging', tier: 'staging' }] };
  }
  if (path === 'projects/1/deployments') {
    if (url.searchParams.get('environment') !== 'production') return { body: [] };
    return {
      body: [
        deployment(100, 'success', t(10), t(8)),
        deployment(101, 'failed', t(20), t(19)),
        deployment(102, 'success', t(21), t(20)),
        deployment(103, 'running', t(22), t(21)),
        deployment(104, 'canceled', t(23), t(21)),
      ],
    };
  }
  if (path === 'projects/2/environments') return { body: [] };
  if (path === 'projects/2/pipelines') {
    return {
      body: [
        { id: 200, sha: 'aaa', status: 'success', updated_at: iso(t(30)) },
        { id: 201, sha: 'bbb', status: 'failed', updated_at: iso(t(40)) },
        { id: 202, sha: 'ccc', status: 'success', updated_at: iso(t(42)) },
        { id: 203, sha: 'ddd', status: 'running', updated_at: iso(t(43)) },
      ],
    };
  }
  if (path === 'projects/2/repository/commits') {
    return {
      body: [
        { id: 'aaa', created_at: iso(t(29)) },
        { id: 'ccc', created_at: iso(t(41)) },
      ],
    };
  }
  return undefined;
}

describe('computeGitLabDoraReport', () => {
  it('uses production deployments, or default-branch pipelines when a project has no production environment', async () => {
    installGitLab(standardGitLab);

    const report = await computeGitLabDoraReport({ credentials, period: '7d' }, NOW);
    const m = report.metrics;

    expect(m.scope).toBe('all');
    expect(m.projects).toEqual([
      { id: 1, name: 'web', source: 'deployments', successCount: 2, failedCount: 1 },
      { id: 2, name: 'api', source: 'pipelines', successCount: 2, failedCount: 1 },
    ]);
    expect(m.deploymentFrequency).toEqual({ perDay: round3(4 / 7), count: 4, rating: 'high' });
    expect(m.changeFailureRate).toEqual({ rate: 33.3, failed: 2, total: 6, rating: 'medium' });
    // Lead times: 2h, 1h (deployments), 1h, 1h (pipelines) → median 1h.
    expect(m.leadTime).toMatchObject({ medianSeconds: 3600, samples: 4 });
    // Recoveries: 1h on production, 2h on trunk.
    expect(m.mttr).toEqual({ averageSeconds: 5400, recoveries: 2, rating: 'high' });
    expect(m.truncated).toBe(false);
    expect(report.trends.deployment_frequency.data.length).toBe(7);
  });

  it('sends the token only as PRIVATE-TOKEN and refuses redirects', async () => {
    installGitLab(standardGitLab);

    await computeGitLabDoraReport({ credentials, period: '7d' }, NOW);

    for (const [input, init] of fetchMock.mock.calls) {
      expect(String(input)).toMatch(/^https:\/\/gitlab\.example\.com\/api\/v4\//);
      expect(String(input)).not.toContain('glpat-secret');
      expect(init.headers['PRIVATE-TOKEN']).toBe('glpat-secret');
      expect(init.redirect).toBe('error');
    }
  });

  it('queries only the period and the recently active projects', async () => {
    installGitLab(standardGitLab);

    await computeGitLabDoraReport({ credentials, period: '7d' }, NOW);

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const projects = urls.find((u) => u.pathname === '/api/v4/projects')!;
    expect(projects.searchParams.get('membership')).toBe('true');
    expect(projects.searchParams.get('last_activity_after')).toBe(iso(WINDOW.start));
    const pipelines = urls.find((u) => u.pathname === '/api/v4/projects/2/pipelines')!;
    expect(pipelines.searchParams.get('ref')).toBe('trunk');
    expect(pipelines.searchParams.get('updated_after')).toBe(iso(WINDOW.start));
    expect(pipelines.searchParams.get('updated_before')).toBe(iso(WINDOW.end));
    // Staging deployments are never requested.
    const envs = urls.filter((u) => u.pathname === '/api/v4/projects/1/deployments').map((u) => u.searchParams.get('environment'));
    expect(envs).toEqual(['production']);
  });

  it('computes a single project', async () => {
    installGitLab(standardGitLab);

    const report = await computeGitLabDoraReport({ credentials, period: '7d', projectId: 1 }, NOW);

    expect(report.metrics.scope).toBe('project');
    expect(report.metrics.projectId).toBe(1);
    expect(report.metrics.changeFailureRate).toMatchObject({ failed: 1, total: 3 });
    expect(fetchMock.mock.calls.some(([u]) => new URL(String(u)).pathname === '/api/v4/projects')).toBe(false);
  });

  it('returns null metrics for an empty GitLab', async () => {
    installGitLab((url) => (url.pathname === '/api/v4/projects' ? { body: [] } : undefined));

    const report = await computeGitLabDoraReport({ credentials, period: '30d' }, NOW);

    expect(report.metrics.deploymentFrequency.rating).toBeNull();
    expect(report.metrics.leadTime.rating).toBeNull();
    expect(report.metrics.mttr.rating).toBeNull();
    expect(report.metrics.changeFailureRate.rating).toBeNull();
    expect(report.metrics.projects).toEqual([]);
    expect(report.trends.deployment_frequency.data).toEqual([]);
  });

  it('skips a project GitLab fails on in the all-projects view', async () => {
    installGitLab((url) => {
      if (url.pathname === '/api/v4/projects/2/environments') return { status: 500, body: {} };
      return standardGitLab(url);
    });

    const report = await computeGitLabDoraReport({ credentials, period: '7d' }, NOW);

    expect(report.metrics.projects[1]).toEqual({ id: 2, name: 'api', source: 'error', successCount: 0, failedCount: 0 });
    expect(report.metrics.changeFailureRate.total).toBe(3);
  });

  it('falls back to pipelines when environments are forbidden', async () => {
    installGitLab((url) => {
      if (url.pathname === '/api/v4/projects/1/environments') return { status: 403, body: {} };
      if (url.pathname === '/api/v4/projects/1/pipelines') return { body: [] };
      return standardGitLab(url);
    });

    const report = await computeGitLabDoraReport({ credentials, period: '7d', projectId: 1 }, NOW);

    expect(report.metrics.projects[0].source).toBe('pipelines');
    expect(report.metrics.deploymentFrequency.perDay).toBeNull();
  });

  it('propagates errors for a single project and for the project list', async () => {
    installGitLab(() => ({ status: 401, body: { message: '401 Unauthorized' } }));

    await expect(computeGitLabDoraReport({ credentials, period: '7d' }, NOW)).rejects.toMatchObject({
      name: 'GitLabRequestError',
      status: 401,
    });
    await expect(computeGitLabDoraReport({ credentials, period: '7d', projectId: 1 }, NOW)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('reports network failures with a null status', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(computeGitLabDoraReport({ credentials, period: '7d' }, NOW)).rejects.toMatchObject({ status: null });
  });

  it('follows pagination and marks the report truncated at the page cap', async () => {
    installGitLab((url) => {
      if (url.pathname === '/api/v4/projects/1/deployments') {
        const page = Number(url.searchParams.get('page'));
        return { body: [deployment(page, 'success', t(page), t(page) - HOUR)], nextPage: page + 1 };
      }
      return standardGitLab(url);
    });

    const report = await computeGitLabDoraReport({ credentials, period: '7d', projectId: 1 }, NOW);

    expect(report.metrics.deploymentFrequency.count).toBe(5);
    expect(report.metrics.truncated).toBe(true);
  });
});

describe('getGitLabDoraReport caching', () => {
  const request = { credentials, organizationId: 'org-a', userId: 'u1', period: '7d' as const };

  beforeEach(() => {
    mockRedis.get.mockReset();
    mockRedis.setex.mockReset();
    installGitLab(standardGitLab);
  });

  it('keys the cache by org, user, instance, project and period, never the token', () => {
    const key = doraCacheKey({ ...request, baseUrl: credentials.baseUrl });

    expect(key).toMatch(/^dora:v1:org-a:u1:[0-9a-f]{12}:all:7d$/);
    expect(key).not.toContain('glpat');
    expect(doraCacheKey({ ...request, projectId: 3, baseUrl: credentials.baseUrl })).toMatch(/:3:7d$/);
    expect(doraCacheKey({ ...request, organizationId: null, baseUrl: credentials.baseUrl })).toMatch(/^dora:v1:none:u1:/);
    expect(doraCacheKey({ ...request, baseUrl: 'https://other.example.com' })).not.toBe(key);
  });

  it('serves a cached report without calling GitLab', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ metrics: { scope: 'all' }, trends: {} }));

    const report = await getGitLabDoraReport(request);

    expect(report.metrics.scope).toBe('all');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('computes and stores the report with a short TTL on a miss', async () => {
    mockRedis.get.mockResolvedValue(null);

    const report = await getGitLabDoraReport(request);

    expect(report.metrics.projects).toHaveLength(2);
    expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^dora:v1:org-a:u1:/), 120, expect.any(String));
    expect(mockRedis.setex.mock.calls[0][2]).not.toContain('glpat-secret');
  });

  it('still answers when Redis is down', async () => {
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    mockRedis.setex.mockRejectedValue(new Error('ECONNREFUSED'));

    const report = await getGitLabDoraReport(request);

    expect(report.metrics.projects).toHaveLength(2);
  });

  it('does not cache GitLab failures', async () => {
    mockRedis.get.mockResolvedValue(null);
    installGitLab(() => ({ status: 401, body: {} }));

    await expect(getGitLabDoraReport(request)).rejects.toBeInstanceOf(GitLabRequestError);
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});

describe('describeDoraError', () => {
  it.each([
    [new GitLabCredentialsError('GITLAB_NOT_CONFIGURED'), 'all', 409, 'GITLAB_NOT_CONFIGURED'],
    [new GitLabRequestError(null, 'x'), 'all', 504, 'GITLAB_UNREACHABLE'],
    [new GitLabRequestError(401, 'x'), 'project', 502, 'GITLAB_AUTH_FAILED'],
    [new GitLabRequestError(404, 'x'), 'project', 404, 'PROJECT_NOT_FOUND'],
    [new GitLabRequestError(403, 'x'), 'all', 502, 'GITLAB_ERROR'],
  ] as const)('%s (%s) → %i %s', (error, scope, status, code) => {
    expect(describeDoraError(error, scope)).toMatchObject({ status, code });
  });

  it('returns null for unexpected errors', () => {
    expect(describeDoraError(new Error('boom'), 'all')).toBeNull();
  });
});
