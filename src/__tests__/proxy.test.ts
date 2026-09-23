/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { isPublicStaticPath, proxy } from '../proxy';

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

describe('proxy', () => {
  describe('without a session cookie', () => {
    it.each(['/', '/settings', '/analytics'])('redirects page %s to /login', (path) => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${BASE}/login`);
    });

    it.each(['/api/projects', '/api/auth/session', '/api/auth/logout'])(
      'returns 401 for API route %s',
      async (path) => {
        const res = proxy(makeRequest(path));
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      }
    );

    it('treats an empty cookie value as unauthenticated', () => {
      const res = proxy(makeRequest('/api/projects', { cookie: '' }));
      expect(res.status).toBe(401);
    });

    it('does not accept a Bearer header in place of a session cookie', () => {
      const res = proxy(
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
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(401);
    });

    it('allows sub-paths of a public API route', () => {
      const res = proxy(makeRequest('/api/webhook/gitlab/extra'));
      expect(isPassThrough(res)).toBe(true);
    });

    it.each(['/login', '/api/auth/login', '/api/webhook/gitlab', '/api/setup', '/api/version'])(
      'allows public route %s',
      (path) => {
        const res = proxy(makeRequest(path));
        expect(isPassThrough(res)).toBe(true);
      }
    );
  });

  describe('PWA static files', () => {
    const publicFiles = [
      '/sw.js',
      '/swe-worker-5c72df51bb1f6ee0.js',
      '/workbox-4754cb34.js',
      '/manifest.json',
      '/manifest.webmanifest',
      '/icons/icon-192x192.png',
      '/favicon.ico',
      '/robots.txt',
      '/serwist/sw.js',
      '/serwist/sw.js.map',
      '/serwist/chunks/abc-123.js',
    ];

    it.each(publicFiles)('serves %s without a session', (path) => {
      const res = proxy(makeRequest(path));
      expect(isPassThrough(res)).toBe(true);
    });

    it.each(publicFiles)('serves %s with a session', (path) => {
      expect(isPassThrough(proxy(makeRequest(path, { cookie: 'token' })))).toBe(true);
    });

    it.each([
      '/sw.js/../api/channels',
      '/workbox-evil/../api/channels',
      '/icons/../api/channels',
      '/serwist/../api/channels',
      '/api/sw.js',
      '/api/manifest.json',
      '/api/workbox-abc.js',
      '/api/channels/sw.js',
      '/api/serwist/sw.js',
      '/api/icons/x.png',
    ])('keeps %s behind auth', async (path) => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it.each([
      '/workbox-evil/../settings',
      '/sw.js/../settings',
      '/sw.js/settings',
      '/sw.jsx',
      '/sw.js.map',
      '/manifest.json/settings',
      '/workbox-.js',
      '/workbox-abc.js/settings',
      '/swe-worker-.js',
      '/icons',
      '/icons/',
      '/icons/a/b.png',
      '/serwist',
      '/serwist/',
      '/settings/sw.js',
      '/~offline',
    ])('keeps page %s behind auth', (path) => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${BASE}/login`);
    });

    // The URL parser collapses dot segments before the proxy sees them; the matcher must also
    // reject raw, unnormalised paths in case that ever changes.
    it.each([
      '/sw.js/../api/channels',
      '/workbox-evil/../settings',
      '/icons/..',
      '/icons/../settings',
      '/serwist/../api/channels',
      '/serwist/./sw.js',
      '/serwist/sw.js/../../api/channels',
      '/sw.js%2f..%2fapi%2fchannels',
      '/sw.js?x=1',
      '/SW.JS',
      '//sw.js',
    ])('rejects raw path %s', (path) => {
      expect(isPublicStaticPath(path)).toBe(false);
    });
  });

  describe('with a session cookie', () => {
    it('allows protected pages and API routes', () => {
      expect(isPassThrough(proxy(makeRequest('/', { cookie: 'token' })))).toBe(true);
      expect(isPassThrough(proxy(makeRequest('/api/projects', { cookie: 'token' })))).toBe(
        true
      );
    });

    it('redirects /login to the dashboard', () => {
      const res = proxy(makeRequest('/login', { cookie: 'token' }));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(`${BASE}/`);
    });
  });
});
