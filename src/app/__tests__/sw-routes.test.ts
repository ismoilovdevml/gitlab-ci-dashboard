/**
 * @jest-environment node
 */
import {
  CACHE_NAMES,
  type RouteContext,
  isApiRequest,
  isAppShell,
  isImage,
  isLegacyCache,
  isStaticResource,
} from '../sw-routes';

const ORIGIN = 'https://dashboard.example.com';

function ctx(path: string, { origin = ORIGIN, headers = {} }: { origin?: string; headers?: Record<string, string> } = {}): RouteContext {
  const url = new URL(path, origin);
  return { url, request: new Request(url, { headers }), sameOrigin: url.origin === ORIGIN };
}

const matchers = { isApiRequest, isAppShell, isImage, isStaticResource };
const matching = (context: RouteContext) =>
  Object.entries(matchers)
    .filter(([, match]) => match(context))
    .map(([name]) => name);

describe('service worker routes', () => {
  it.each([
    '/api',
    '/api/auth/session',
    '/api/gitlab/v4/projects?per_page=100',
    '/api/artifacts/download?file=report.png',
    '/api/history/export.css',
    '/api/assets/logo.png',
    '/api/bundle.js',
  ])('sends %s to the network only', (path) => {
    expect(isApiRequest(ctx(path))).toBe(true);
  });

  it('checks /api before any caching route', () => {
    // Paths under /api that also look like static files must still hit isApiRequest,
    // which sw.ts registers first.
    expect(matching(ctx('/api/assets/logo.png'))).toEqual(['isApiRequest', 'isImage']);
    expect(matching(ctx('/api/bundle.js'))).toEqual(['isApiRequest', 'isStaticResource']);
  });

  it('does not treat look-alike paths as API routes', () => {
    expect(isApiRequest(ctx('/apis'))).toBe(false);
    expect(isApiRequest(ctx('/login?next=/api/x'))).toBe(false);
    expect(isApiRequest(ctx('/api/x', { origin: 'https://gitlab.example.com' }))).toBe(false);
  });

  it('caches the dashboard shell document but not its RSC payloads', () => {
    expect(isAppShell(ctx('/'))).toBe(true);
    expect(isAppShell(ctx('/?tab=pipelines'))).toBe(true);
    expect(isAppShell(ctx('/?_rsc=abc'))).toBe(false);
    expect(isAppShell(ctx('/', { headers: { RSC: '1' } }))).toBe(false);
    expect(isAppShell(ctx('/login'))).toBe(false);
    expect(isAppShell(ctx('/', { origin: 'https://gitlab.example.com' }))).toBe(false);
  });

  it('matches same-origin images and static resources only', () => {
    expect(matching(ctx('/gitlab-logo-500-rgb.png'))).toEqual(['isImage']);
    expect(matching(ctx('/_next/static/chunks/app.js'))).toEqual(['isStaticResource']);
    expect(matching(ctx('/_next/static/chunks/app.css'))).toEqual(['isStaticResource']);
    expect(matching(ctx('/_next/static/media/font.woff2'))).toEqual(['isStaticResource']);
    expect(matching(ctx('/uploads/avatar.png', { origin: 'https://gitlab.example.com' }))).toEqual([]);
    expect(matching(ctx('/login'))).toEqual([]);
  });

  it('identifies caches left behind by the previous worker', () => {
    expect(isLegacyCache('start-url')).toBe(true);
    expect(isLegacyCache('pages')).toBe(true);
    expect(isLegacyCache('next-static-js-assets')).toBe(true);
    expect(isLegacyCache('workbox-precache-v2-https://dashboard.example.com/')).toBe(true);
    expect(isLegacyCache('image-cache')).toBe(true);
    expect(isLegacyCache('static-resources')).toBe(true);
    for (const name of Object.values(CACHE_NAMES)) expect(isLegacyCache(name)).toBe(false);
    expect(isLegacyCache('serwist-precache-v2-https://dashboard.example.com/')).toBe(false);
  });
});
