// Route matchers and cache settings for the service worker (src/app/sw.ts). Kept free of
// `serwist` imports so they can be unit tested outside a worker.

export interface RouteContext {
  url: URL;
  request: Request;
  sameOrigin: boolean;
}

export const CACHE_NAMES = {
  appShell: 'app-shell',
  images: 'images',
  static: 'static-assets',
} as const;

// Caches written by the previous next-pwa/Workbox worker. Their entries are not tracked by
// Serwist's expiration plugin, so they are dropped rather than reused.
const LEGACY_CACHE_NAMES: readonly string[] = [
  'start-url',
  'image-cache',
  'static-resources',
  'pages',
  'static-style-assets',
  'next-static-js-assets',
  'static-js-assets',
];
const LEGACY_PRECACHE_PREFIX = 'workbox-precache-';

export const isLegacyCache = (name: string): boolean =>
  LEGACY_CACHE_NAMES.includes(name) || name.startsWith(LEGACY_PRECACHE_PREFIX);

// API responses are per-user and authenticated: always go to the network, never cache.
export const isApiRequest = ({ url, sameOrigin }: RouteContext): boolean =>
  sameOrigin && (url.pathname === '/api' || url.pathname.startsWith('/api/'));

// The dashboard shell HTML. The page is static, so the cached copy holds no user data.
// React Server Component payloads for the same URL are left to the network.
export const isAppShell = ({ url, request, sameOrigin }: RouteContext): boolean =>
  sameOrigin &&
  url.pathname === '/' &&
  !url.searchParams.has('_rsc') &&
  request.headers.get('RSC') !== '1';

export const isImage = ({ url, sameOrigin }: RouteContext): boolean =>
  sameOrigin && /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url.pathname);

export const isStaticResource = ({ url, sameOrigin }: RouteContext): boolean =>
  sameOrigin && /\.(js|css|woff|woff2|ttf|otf)$/i.test(url.pathname);

export const IMAGE_EXPIRATION = { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 } as const;
export const STATIC_EXPIRATION = { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 } as const;
