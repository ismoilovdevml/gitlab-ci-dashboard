/**
 * @jest-environment node
 */
import http from 'http';
import { AddressInfo } from 'net';
import { createGitLabHttpClient } from '@/lib/gitlab/http';
import { GitLabUrlError } from '@/lib/gitlab/url';
import { GitLabClient } from '@/lib/gitlab-client';

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/cache', () => ({
  cacheWithTTL: jest.fn((_key: string, fn: () => unknown) => fn()),
  invalidateCacheByTag: jest.fn(),
}));

const TOKEN = 'glpat-secret-token';

interface Recorded {
  path: string;
  token: string | undefined;
}

interface TestServer {
  url: string;
  requests: Recorded[];
  close: () => Promise<void>;
}

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<TestServer> {
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url ?? '', token: req.headers['private-token'] as string | undefined });
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function json(res: http.ServerResponse, body: unknown) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

describe('GitLab HTTP clients: URL validation and redirect policy', () => {
  let attacker: TestServer;
  let gitlab: TestServer;

  beforeEach(async () => {
    attacker = await startServer((_req, res) => json(res, [{ id: 666 }]));
    gitlab = await startServer((req, res) => {
      if (req.url?.startsWith('/api/v4/redirect-same')) {
        res.writeHead(302, { location: '/api/v4/projects' });
        res.end();
        return;
      }
      if (req.url?.startsWith('/api/v4/projects') || req.url?.startsWith('/api/v4/user')) {
        // Every GitLab API call is redirected to another origin.
        res.writeHead(302, { location: `${attacker.url}${req.url}` });
        res.end();
        return;
      }
      json(res, { ok: true });
    });
  });

  afterEach(async () => {
    await attacker.close();
    await gitlab.close();
    delete (globalThis as { window?: unknown }).window;
  });

  describe('invalid base URL', () => {
    const invalid = ['', 'not a url', 'ftp://gitlab.example.com', 'javascript:alert(1)', 'https://user:pw@gitlab.example.com', 'https://gitlab.example.com/?x=1'];

    it.each(invalid)('createGitLabHttpClient rejects %p', (url) => {
      expect(() => createGitLabHttpClient(url, TOKEN)).toThrow(GitLabUrlError);
    });

    it.each(invalid)('GitLabClient rejects %p', (url) => {
      expect(() => new GitLabClient({ url, token: TOKEN })).toThrow(GitLabUrlError);
    });

    it('normalises the base URL and keeps a relative root', () => {
      expect(createGitLabHttpClient('  https://gitlab.example.com/gitlab/  ', TOKEN).baseUrl).toBe(
        'https://gitlab.example.com/gitlab'
      );
      expect(createGitLabHttpClient('https://gitlab.example.com/gitlab/', TOKEN).client.defaults.baseURL).toBe(
        'https://gitlab.example.com/gitlab/api/v4'
      );
    });
  });

  describe('server (node http adapter)', () => {
    it('GitLabClient does not follow a cross-origin redirect', async () => {
      const client = new GitLabClient({ url: gitlab.url, token: TOKEN });

      await expect(client.get('/user')).rejects.toThrow();

      expect(gitlab.requests).toHaveLength(1);
      expect(attacker.requests).toHaveLength(0);
    });

    it('does not follow a same-origin redirect either', async () => {
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);

      await expect(client.get('/redirect-same')).rejects.toThrow();
      expect(gitlab.requests).toHaveLength(1);
    });

    it('never sends the token to an absolute URL passed as the endpoint', async () => {
      const client = new GitLabClient({ url: gitlab.url, token: TOKEN });

      await client.get(`${attacker.url}/steal`).catch(() => undefined);

      expect(attacker.requests).toHaveLength(0);
    });

    it('refuses a per-request override that points at another origin', async () => {
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);

      await expect(
        client.get('/anything', { baseURL: `${attacker.url}/api/v4` })
      ).rejects.toThrow(GitLabUrlError);
      expect(attacker.requests).toHaveLength(0);
    });

    it('sends the token on normal same-origin requests', async () => {
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);

      const res = await client.get('/version');

      expect(res.data).toEqual({ ok: true });
      expect(gitlab.requests[0]).toEqual({ path: '/api/v4/version', token: TOKEN });
    });
  });

  describe('browser (fetch adapter with manual redirects)', () => {
    beforeEach(() => {
      (globalThis as { window?: unknown }).window = { fetch: globalThis.fetch };
    });

    it('uses the fetch adapter with redirect: manual', () => {
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);
      expect(client.defaults.adapter).toBe('fetch');
      expect(client.defaults.fetchOptions).toEqual({ redirect: 'manual' });
    });

    it('does not follow a cross-origin redirect', async () => {
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);

      await expect(client.get('/projects')).rejects.toThrow();

      expect(gitlab.requests).toHaveLength(1);
      expect(attacker.requests).toHaveLength(0);
    });

    it('rejects an opaque redirect (status 0) instead of resolving it', async () => {
      // Browsers answer a redirect: 'manual' fetch with an opaque status-0 response.
      const { client } = createGitLabHttpClient(gitlab.url, TOKEN);
      client.interceptors.request.use((config) => {
        config.adapter = async () => ({
          data: '',
          status: 0,
          statusText: '',
          headers: {},
          config,
          request: {},
        });
        return config;
      });

      await expect(client.get('/projects')).rejects.toThrow(GitLabUrlError);
    });
  });
});
