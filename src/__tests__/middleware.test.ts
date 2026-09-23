/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const BASE = 'http://localhost:3000';
const SESSION_COOKIE = 'gitlab_dashboard_session';

function makeRequest(
  path: string,
  { cookie, headers }: { cookie?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const allHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (cookie !== undefined) {
    allHeaders.cookie = `${SESSION_COOKIE}=${cookie}`;
  }
  return new NextRequest(new URL(path, BASE), { headers: allHeaders });
}

function isPassThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

describe('middleware', () => {
  describe('without a session cookie', () => {
    it.each(['/', '/settings', '/analytics'])('redirects page %s to /login', (path) => {
      const res = middleware(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${BASE}/login`);
    });

    it.each(['/api/projects', '/api/auth/session', '/api/auth/logout'])(
      'returns 401 for API route %s',
      async (path) => {
        const res = middleware(makeRequest(path));
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      }
    );

    it('treats an empty cookie value as unauthenticated', () => {
      const res = middleware(makeRequest('/api/projects', { cookie: '' }));
      expect(res.status).toBe(401);
    });

    it('does not accept a Bearer header in place of a session cookie', () => {
      const res = middleware(
        makeRequest('/api/projects', { headers: { authorization: 'Bearer anything' } })
      );
      expect(res.status).toBe(401);
    });

    it.each([
      '/api/versions',
      '/api/setupx',
      '/api/setup-admin',
      '/api/webhook/gitlabx',
      '/api/auth/login-as',
    ])('does not treat prefix sibling %s as public', (path) => {
      const res = middleware(makeRequest(path));
      expect(res.status).toBe(401);
    });

    it('allows sub-paths of a public API route', () => {
      const res = middleware(makeRequest('/api/webhook/gitlab/extra'));
      expect(isPassThrough(res)).toBe(true);
    });

    it.each(['/login', '/api/auth/login', '/api/webhook/gitlab', '/api/setup', '/api/version'])(
      'allows public route %s',
      (path) => {
        const res = middleware(makeRequest(path));
        expect(isPassThrough(res)).toBe(true);
      }
    );
  });

  describe('with a session cookie', () => {
    it('allows protected pages and API routes', () => {
      expect(isPassThrough(middleware(makeRequest('/', { cookie: 'token' })))).toBe(true);
      expect(isPassThrough(middleware(makeRequest('/api/projects', { cookie: 'token' })))).toBe(
        true
      );
    });

    it('redirects /login to the dashboard', () => {
      const res = middleware(makeRequest('/login', { cookie: 'token' }));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${BASE}/`);
    });
  });
});
