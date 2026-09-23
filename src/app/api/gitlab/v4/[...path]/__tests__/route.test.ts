/**
 * @jest-environment node
 */
import http from 'http';
import { AddressInfo } from 'net';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/gitlab/token';
import { SESSION_COOKIE_NAME } from '@/lib/csrf';
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET, TEST_SESSION_TOKEN } from '@/lib/testing/csrf';
import * as route from '../route';

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logSecurityEvent: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));

const { GET, POST, DELETE } = route;
const mockGetCurrentUser = getCurrentUser as jest.Mock;
const TOKEN = 'glpat-proxy-secret-7f3a';

interface Recorded {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface TestServer {
  url: string;
  requests: Recorded[];
  close: () => Promise<void>;
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function startServer(handler: Handler): Promise<TestServer> {
  const requests: Recorded[] = [];
  const sockets = new Set<import('net').Socket>();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      handler(req, res);
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise((r) => {
            sockets.forEach((s) => s.destroy());
            server.close(() => r());
          }),
      });
    });
  });
}

function params(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function proxyUrl(path: string[], query = ''): string {
  return `http://localhost/api/gitlab/v4/${path.join('/')}${query}`;
}

function getRequest(path: string[], query = '', init: { method?: string; signal?: AbortSignal } = {}) {
  return new NextRequest(proxyUrl(path, query), {
    method: init.method ?? 'GET',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}`, authorization: 'Bearer client-auth' },
    signal: init.signal,
  });
}

function call(handler: typeof GET, req: NextRequest, path: string[]) {
  return handler(req, params(path));
}

/** Read the body and assert the token is not in it or in any header. */
async function readSafe(res: Response): Promise<string> {
  const text = await res.text();
  expect(text).not.toContain(TOKEN);
  res.headers.forEach((value) => expect(value).not.toContain(TOKEN));
  return text;
}

describe('/api/gitlab/v4/[...path] proxy', () => {
  const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;
  let gitlab: TestServer;
  let attacker: TestServer;
  let releaseTrace: (() => void) | null;

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = 'proxy-route-test-key';
  });

  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    releaseTrace = null;
    attacker = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"stolen":true}');
    });
    gitlab = await startServer((req, res) => {
      const path = (req.url ?? '').split('?')[0].replace(/^\/gitlab/, '');
      switch (`${req.method} ${path}`) {
        case 'GET /api/v4/projects':
          res.writeHead(200, {
            'content-type': 'application/json',
            'x-total': '42',
            'x-total-pages': '3',
            'x-page': '1',
            'x-per-page': '20',
            'x-next-page': '2',
            'x-prev-page': '',
            'ratelimit-remaining': '599',
            'ratelimit-limit': '600',
            'retry-after': '7',
            'set-cookie': '_gitlab_session=abc; path=/',
            'x-gitlab-meta': 'internal',
            'cache-control': 'max-age=3600, public',
            link:
              `<https://gitlab.internal/gitlab/api/v4/projects?page=2&per_page=20&private_token=leak>; rel="next", ` +
              `<https://gitlab.internal/other/path?page=3>; rel="last"`,
          });
          res.end(JSON.stringify([{ id: 1 }]));
          return;
        case 'GET /api/v4/projects/1/pipelines':
          res.writeHead(302, { location: `${attacker.url}/api/v4/projects/1/pipelines` });
          res.end();
          return;
        case 'GET /api/v4/projects/2':
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end('{"message":"401 Unauthorized"}');
          return;
        case 'GET /api/v4/projects/1/jobs/5/trace':
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.write('line 1\n');
          releaseTrace = () => res.end('line 2\n');
          return;
        case 'GET /api/v4/runners/9':
          // Never answers: used for client abort.
          return;
        case 'POST /api/v4/projects/1/pipelines/2/retry':
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end('{"id":2,"status":"pending"}');
          return;
        case 'DELETE /api/v4/projects/1/jobs/2/artifacts':
        case 'DELETE /api/v4/projects/1/registry/repositories/3/tags/v1.2.3-rc_1':
          res.writeHead(204);
          res.end();
          return;
        case 'GET /api/v4/projects/1/runners':
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30', 'ratelimit-reset': '1700000000' });
          res.end('{"message":"Too Many Requests"}');
          return;
        default:
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('{"message":"404 Not Found"}');
      }
    });
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', gitlabUrl: gitlab.url, gitlabToken: encryptToken(TOKEN) });
  });

  afterEach(async () => {
    releaseTrace?.();
    await gitlab.close();
    await attacker.close();
    // The token must never reach the logs.
    const logged = JSON.stringify([
      (logger.info as jest.Mock).mock.calls,
      (logger.warn as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
      (logger.debug as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain(TOKEN);
  });

  describe('successful forwarding', () => {
    it('forwards an allowlisted GET with the token, filtered query and filtered headers', async () => {
      const res = await call(
        GET,
        getRequest(['projects'], '?page=2&per_page=20&membership=true&private_token=x&access_token=y&job_token=z&foo=bar&scope[]=success'),
        ['projects']
      );

      expect(res.status).toBe(200);
      expect(JSON.parse(await readSafe(res))).toEqual([{ id: 1 }]);

      expect(gitlab.requests).toHaveLength(1);
      const upstream = gitlab.requests[0];
      expect(upstream.method).toBe('GET');
      const query = new URL(upstream.url, 'http://x').searchParams;
      expect(Array.from(query.keys()).sort()).toEqual(['membership', 'page', 'per_page', 'scope[]']);
      expect(upstream.headers['private-token']).toBe(TOKEN);
      expect(upstream.headers.cookie).toBeUndefined();
      expect(upstream.headers.authorization).toBeUndefined();
      expect(upstream.headers['x-csrf-token']).toBeUndefined();
    });

    it('passes through pagination, rate-limit and content headers only', async () => {
      const res = await call(GET, getRequest(['projects']), ['projects']);
      await readSafe(res);

      expect(res.headers.get('content-type')).toBe('application/json');
      expect(res.headers.get('x-total')).toBe('42');
      expect(res.headers.get('x-total-pages')).toBe('3');
      expect(res.headers.get('x-page')).toBe('1');
      expect(res.headers.get('x-per-page')).toBe('20');
      expect(res.headers.get('x-next-page')).toBe('2');
      expect(res.headers.get('x-prev-page')).toBe('');
      expect(res.headers.get('ratelimit-remaining')).toBe('599');
      expect(res.headers.get('ratelimit-limit')).toBe('600');
      expect(res.headers.get('retry-after')).toBe('7');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('x-gitlab-meta')).toBeNull();
    });

    it('rewrites Link to the proxy path and drops non-API entries and token params', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'u1',
        gitlabUrl: `${gitlab.url}/gitlab/`,
        gitlabToken: encryptToken(TOKEN),
      });
      const res = await call(GET, getRequest(['projects']), ['projects']);
      await readSafe(res);

      expect(gitlab.requests[0].url.startsWith('/gitlab/api/v4/projects')).toBe(true);
      expect(res.headers.get('link')).toBe('</api/gitlab/v4/projects?page=2&per_page=20>; rel="next"');
    });

    it('passes through 429 with Retry-After and RateLimit headers', async () => {
      const res = await call(GET, getRequest(['projects', '1', 'runners']), ['projects', '1', 'runners']);
      await readSafe(res);
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('30');
      expect(res.headers.get('ratelimit-reset')).toBe('1700000000');
    });

    it('passes through upstream 404 status', async () => {
      const res = await call(GET, getRequest(['projects', '77']), ['projects', '77']);
      expect(res.status).toBe(404);
      await readSafe(res);
    });

    it('streams the response body without waiting for upstream to finish', async () => {
      const path = ['projects', '1', 'jobs', '5', 'trace'];
      const res = await call(GET, getRequest(path), path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain');

      const reader = res.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe('line 1\n');
      // Upstream has not ended yet; the proxy already delivered the first chunk.
      expect(releaseTrace).not.toBeNull();
      releaseTrace!();
      releaseTrace = null;
      let rest = '';
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        rest += new TextDecoder().decode(chunk.value);
      }
      expect(rest).toBe('line 2\n');
    });

    it('forwards an allowlisted POST with a valid CSRF token and no request body', async () => {
      const path = ['projects', '1', 'pipelines', '2', 'retry'];
      const req = csrfRequest(proxyUrl(path), 'POST', 'valid', { variables: [{ key: 'X', value: 'evil' }] });
      const res = await call(POST, req, path);

      expect(res.status).toBe(201);
      expect(JSON.parse(await readSafe(res))).toEqual({ id: 2, status: 'pending' });
      expect(gitlab.requests).toHaveLength(1);
      expect(gitlab.requests[0].method).toBe('POST');
      expect(gitlab.requests[0].body).toBe('');
      expect(gitlab.requests[0].headers['content-type']).toBeUndefined();
      expect(gitlab.requests[0].headers['x-csrf-token']).toBeUndefined();
    });

    it.each([
      [['projects', '1', 'jobs', '2', 'artifacts']],
      [['projects', '1', 'registry', 'repositories', '3', 'tags', 'v1.2.3-rc_1']],
    ])('forwards an allowlisted DELETE %j and returns 204 with no body', async (path) => {
      const res = await call(DELETE, csrfRequest(proxyUrl(path), 'DELETE', 'valid'), path);
      expect(res.status).toBe(204);
      expect(await readSafe(res)).toBe('');
      expect(gitlab.requests[0].method).toBe('DELETE');
    });

    it('answers HEAD from the GET route without a body', async () => {
      const res = await call(GET, getRequest(['projects'], '', { method: 'HEAD' }), ['projects']);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-total')).toBe('42');
      expect(await res.text()).toBe('');
    });
  });

  describe('auth and CSRF', () => {
    it('returns 401 without a session and never calls GitLab', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const res = await call(GET, getRequest(['projects']), ['projects']);
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(gitlab.requests).toHaveLength(0);
    });

    describe.each([
      ['POST', POST, ['projects', '1', 'pipelines', '2', 'retry']],
      ['DELETE', DELETE, ['projects', '1', 'jobs', '2', 'artifacts']],
    ] as const)('%s', (method, handler, path) => {
      it.each(REJECTED_MODES)('rejects a %s CSRF token with 403', async (mode) => {
        const res = await call(handler, csrfRequest(proxyUrl([...path]), method, mode), [...path]);
        expect(res.status).toBe(403);
        expect((await res.json()).code).toMatch(/^CSRF_TOKEN_/);
        expect(gitlab.requests).toHaveLength(0);
      });
    });
  });

  describe('path and method policy', () => {
    it.each([
      [['projects', '..', 'users']],
      [['projects', '.', '1']],
      [['projects', '1', 'jobs', '2', '..', '..', '..', 'admin']],
      [['projects', '1%2F..%2Fusers']],
      [['projects', '1/../../users']],
      [['projects', '1\\..\\users']],
      [['projects', '']],
      [[]],
    ])('rejects unsafe segments %j with 400', async (path) => {
      const res = await call(GET, getRequest(['projects', 'x']), path);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('INVALID_PATH');
      expect(gitlab.requests).toHaveLength(0);
    });

    it('rejects a raw path with percent-encoding even if segments look safe', async () => {
      const req = new NextRequest('http://localhost/api/gitlab/v4/projects/%31', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` },
      });
      const res = await call(GET, req, ['projects', '1']);
      expect(res.status).toBe(400);
      expect(gitlab.requests).toHaveLength(0);
    });

    it.each([
      [['users']],
      [['user']],
      [['projects', '1', 'variables']],
      [['projects', 'group-name']],
      [['projects', '0']],
      [['projects', '-1']],
      [['runners', 'all', 'extra']],
      [['admin', 'users']],
    ])('returns 404 for a non-allowlisted path %j', async (path) => {
      const res = await call(GET, getRequest(['x']), path);
      expect(res.status).toBe(404);
      expect(gitlab.requests).toHaveLength(0);
    });

    it('returns 404 for a plain non-allowlisted path', async () => {
      const res = await call(GET, getRequest(['users']), ['users']);
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('NOT_FOUND');
    });

    it('returns 405 with Allow for a known path used with the wrong method', async () => {
      const path = ['projects', '1', 'star'];
      const res = await call(GET, getRequest(path), path);
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');

      const del = await call(DELETE, csrfRequest(proxyUrl(['projects']), 'DELETE', 'valid'), ['projects']);
      expect(del.status).toBe(405);
      expect(del.headers.get('allow')).toBe('GET');
      expect(gitlab.requests).toHaveLength(0);
    });

    it('rejects a tag name outside the allowed character set', async () => {
      const path = ['projects', '1', 'registry', 'repositories', '3', 'tags', 'v1:latest'];
      const res = await call(DELETE, csrfRequest(proxyUrl(['x']), 'DELETE', 'valid'), path);
      expect(res.status).toBe(404);
      expect(gitlab.requests).toHaveLength(0);
    });

    it('does not export PUT or PATCH handlers (Next answers 405)', () => {
      expect((route as Record<string, unknown>).PUT).toBeUndefined();
      expect((route as Record<string, unknown>).PATCH).toBeUndefined();
      expect(route.dynamic).toBe('force-dynamic');
      expect(route.runtime).toBe('nodejs');
    });
  });

  describe('upstream policy', () => {
    it('turns an upstream redirect into 502 and does not follow it', async () => {
      const path = ['projects', '1', 'pipelines'];
      const res = await call(GET, getRequest(path), path);
      expect(res.status).toBe(502);
      expect((await readSafe(res))).toContain('GITLAB_REDIRECT');
      expect(attacker.requests).toHaveLength(0);
    });

    it('maps upstream 401 to 502 GITLAB_UNAUTHORIZED', async () => {
      const res = await call(GET, getRequest(['projects', '2']), ['projects', '2']);
      expect(res.status).toBe(502);
      expect(JSON.parse(await readSafe(res)).code).toBe('GITLAB_UNAUTHORIZED');
    });

    it('returns 502 GITLAB_UNREACHABLE when GitLab is down', async () => {
      const deadUrl = gitlab.url;
      await gitlab.close();
      gitlab = await startServer(() => {});
      mockGetCurrentUser.mockResolvedValue({ id: 'u1', gitlabUrl: deadUrl, gitlabToken: encryptToken(TOKEN) });

      const res = await call(GET, getRequest(['projects']), ['projects']);
      expect(res.status).toBe(502);
      expect(JSON.parse(await readSafe(res)).code).toBe('GITLAB_UNREACHABLE');
    });

    it('aborts the upstream call when the client goes away', async () => {
      const controller = new AbortController();
      const pending = call(GET, getRequest(['runners', '9'], '', { signal: controller.signal }), ['runners', '9']);
      await new Promise((r) => setTimeout(r, 50));
      controller.abort();
      const res = await pending;
      expect(res.status).toBe(502);
      await readSafe(res);
    });
  });

  describe('GitLab configuration errors', () => {
    it.each([
      [{ gitlabUrl: '', gitlabToken: 'x' }, 409, 'GITLAB_NOT_CONFIGURED'],
      [{ gitlabUrl: 'https://gitlab.example.com', gitlabToken: '' }, 409, 'GITLAB_NOT_CONFIGURED'],
      [{ gitlabUrl: 'ftp://gitlab.example.com', gitlabToken: 'x' }, 400, 'GITLAB_URL_INVALID'],
      [{ gitlabUrl: 'https://gitlab.example.com', gitlabToken: 'tok:00:00:00' }, 500, 'GITLAB_TOKEN_UNREADABLE'],
    ])('%j -> %i %s', async (user, status, code) => {
      mockGetCurrentUser.mockResolvedValue({ id: 'u1', ...user });
      const res = await call(GET, getRequest(['projects']), ['projects']);
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toEqual(expect.any(String));
      expect(gitlab.requests).toHaveLength(0);
    });
  });
});
