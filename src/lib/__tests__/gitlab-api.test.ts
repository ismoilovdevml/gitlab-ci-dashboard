import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import GitLabAPI, {
  apiPath,
  getGitLabAPIAsync,
  GITLAB_NOT_CONFIGURED_MESSAGE,
  GITLAB_PROXY_BASE_URL,
  invalidateCache,
  resetGitLabAPI,
} from '@/lib/gitlab-api';
import { areSegmentsSafe, matchProxyRoute, PROXY_ALLOWLIST } from '@/lib/gitlab/proxy-allowlist';

jest.mock('@/lib/api/csrf-client', () => ({
  withCsrf: jest.fn(<T,>(request: (headers: Record<string, string>) => Promise<T>) =>
    request({ 'x-csrf-token': 'csrf-test' })
  ),
}));

interface RecordedRequest {
  method: string;
  url: string;
  baseURL: string | undefined;
  headers: Record<string, unknown>;
}

const NOW = new Date().toISOString();

// One record that satisfies every list consumer in the client (projects,
// pipelines, jobs, runners, repositories), so each code path makes its calls.
const ITEM = {
  id: 7,
  project_id: 7,
  name: 'unit-test',
  stage: 'deploy',
  status: 'failed',
  ref: 'main',
  created_at: NOW,
  updated_at: NOW,
  finished_at: NOW,
  duration: 5,
  artifacts_file: { filename: 'artifacts.zip', size: 1 },
};

function attachRecorder(api: GitLabAPI, options: { denyAdminRunners?: boolean } = {}): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  const http = (api as unknown as { api: AxiosInstance }).api;
  http.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    requests.push({
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      baseURL: config.baseURL,
      headers: { ...config.headers },
    });
    if (options.denyAdminRunners && config.url === 'runners/all') {
      const error = Object.assign(new Error('Forbidden'), { response: { status: 403, data: {} } });
      throw error;
    }
    return { data: [ITEM], status: 200, statusText: 'OK', headers: { 'x-total': '1' }, config };
  };
  return requests;
}

// Every public GitLabAPI method with sample arguments. A new method must be
// added here, which forces its requests through the allowlist check below.
const METHOD_CALLS: Record<string, unknown[]> = {
  checkConnection: [],
  getProjects: [],
  starProject: [7],
  unstarProject: [7],
  getProject: [7],
  getProjectBranchesCount: [7],
  getProjectTagsCount: [7],
  getPipelines: [7],
  getAllActivePipelines: [],
  getPipeline: [7, 11],
  retryPipeline: [7, 11],
  cancelPipeline: [7, 11],
  getPipelineJobs: [7, 11],
  getJob: [7, 13],
  getJobTrace: [7, 13],
  retryJob: [7, 13],
  cancelJob: [7, 13],
  playJob: [7, 13],
  getRunners: [],
  getRunner: [3],
  getRunnerJobs: [3],
  getPipelineStats: [],
  getJobArtifacts: [7],
  getAllArtifacts: [],
  deleteArtifacts: [7, 13],
  getContainerRepositories: [7],
  getAllContainerRepositories: [],
  getContainerTags: [7, 5],
  deleteContainerTag: [7, 5, 'v1.2.3-rc_1'],
  deleteContainerRepository: [7, 5],
  getInsightsSummary: [],
  getFailureAnalysis: [],
  getFlakyTests: [],
  getPerformanceBottlenecks: [],
  getDeploymentFrequency: [],
};

const PRIVATE_HELPERS = new Set(['constructor', 'post', 'delete']);

function publicMethodNames(): string[] {
  return Object.getOwnPropertyNames(GitLabAPI.prototype).filter((name) => !PRIVATE_HELPERS.has(name));
}

async function callEveryMethod(api: GitLabAPI): Promise<void> {
  const target = api as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [name, args] of Object.entries(METHOD_CALLS)) {
    invalidateCache();
    await target[name](...args);
  }
}

function routeKey(method: string, url: string): string {
  const match = matchProxyRoute(method, url.split('/'));
  if (!match.ok) throw new Error(`${method} ${url} is not in the proxy allowlist (${match.reason})`);
  return `${match.route.method} ${match.route.pattern}`;
}

describe('GitLabAPI (browser client via the server proxy)', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    invalidateCache();
    resetGitLabAPI();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('covers every public method in the call table', () => {
    expect(publicMethodNames().sort()).toEqual(Object.keys(METHOD_CALLS).sort());
  });

  it('only calls allowlisted proxy routes, and uses the whole allowlist', async () => {
    const api = new GitLabAPI();
    const requests = attachRecorder(api);
    await callEveryMethod(api);

    const fallbackApi = new GitLabAPI();
    const fallbackRequests = attachRecorder(fallbackApi, { denyAdminRunners: true });
    invalidateCache();
    await fallbackApi.getRunners();

    const all = [...requests, ...fallbackRequests];
    expect(all.length).toBeGreaterThan(0);

    const used = new Set<string>();
    for (const req of all) {
      expect(req.baseURL).toBe(GITLAB_PROXY_BASE_URL);
      expect(req.url).not.toMatch(/^\//);
      expect(req.url).not.toContain('%');
      expect(areSegmentsSafe(req.url.split('/'))).toBe(true);
      used.add(routeKey(req.method, req.url));
    }

    const allowlisted = PROXY_ALLOWLIST.map((r) => `${r.method} ${r.pattern}`).sort();
    expect(Array.from(used).sort()).toEqual(allowlisted);
  });

  it('never sends a GitLab token and adds the CSRF header to mutations only', async () => {
    const api = new GitLabAPI();
    const requests = attachRecorder(api);
    await callEveryMethod(api);

    for (const req of requests) {
      const headerNames = Object.keys(req.headers).map((h) => h.toLowerCase());
      expect(headerNames).not.toContain('private-token');
      expect(headerNames).not.toContain('authorization');
      if (req.method === 'GET') {
        expect(headerNames).not.toContain('x-csrf-token');
      } else {
        expect(req.headers['x-csrf-token']).toBe('csrf-test');
      }
    }
  });

  it('does not expose a config/token accessor or the removed artifact download', () => {
    const api = new GitLabAPI() as unknown as Record<string, unknown>;
    expect(api.getConfig).toBeUndefined();
    expect(api.downloadArtifact).toBeUndefined();
  });

  it.each(['bad/tag', '..', '.', '%2e%2e', 'a%2Fb', 'tag with space', 'x'.repeat(129), ''])(
    'refuses container tag %p before making a request',
    async (tag) => {
      const api = new GitLabAPI();
      const requests = attachRecorder(api);

      await expect(api.deleteContainerTag(7, 5, tag)).rejects.toThrow('Invalid GitLab path segment');
      expect(requests).toHaveLength(0);
    }
  );

  describe('apiPath', () => {
    it('joins ids and literals without a leading slash or encoding', () => {
      expect(apiPath('projects', 12, 'registry', 'repositories', 3, 'tags', 'v1.0_rc-2')).toBe(
        'projects/12/registry/repositories/3/tags/v1.0_rc-2'
      );
    });

    it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects id %p', (id) => {
      expect(() => apiPath('projects', id)).toThrow('Invalid GitLab id');
    });
  });

  describe('getGitLabAPIAsync', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function mockConfig(response: { ok: boolean; body?: unknown }) {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: response.ok,
        json: () => Promise.resolve(response.body),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    it('reads the masked config and returns the proxy client', async () => {
      const fetchMock = mockConfig({ ok: true, body: { tokenConfigured: true, token: '***MASKED***' } });

      const api = await getGitLabAPIAsync();

      expect(api).toBeInstanceOf(GitLabAPI);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/config');
    });

    it('throws the not-configured error when no token is stored', async () => {
      mockConfig({ ok: true, body: { tokenConfigured: false, token: '' } });

      await expect(getGitLabAPIAsync()).rejects.toThrow(GITLAB_NOT_CONFIGURED_MESSAGE);
    });

    it('throws when the config cannot be loaded', async () => {
      mockConfig({ ok: false });

      await expect(getGitLabAPIAsync()).rejects.toThrow(GITLAB_NOT_CONFIGURED_MESSAGE);
    });
  });
});
