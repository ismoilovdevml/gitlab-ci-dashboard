/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from 'serwist';
import {
  CACHE_NAMES,
  IMAGE_EXPIRATION,
  STATIC_EXPIRATION,
  isApiRequest,
  isAppShell,
  isImage,
  isLegacyCache,
  isStaticResource,
} from './sw-routes';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  disableDevLogs: true,
  runtimeCaching: [
    // Must stay first: nothing under /api may ever be answered from a cache.
    { matcher: isApiRequest, handler: new NetworkOnly() },
    {
      matcher: isAppShell,
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.appShell,
        // Only a real 200 page; a redirect to /login must not become the offline shell.
        plugins: [{ cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null) }],
      }),
    },
    {
      matcher: isImage,
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.images,
        plugins: [new ExpirationPlugin(IMAGE_EXPIRATION)],
      }),
    },
    {
      matcher: isStaticResource,
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.static,
        plugins: [new ExpirationPlugin(STATIC_EXPIRATION)],
      }),
    },
  ],
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter(isLegacyCache).map((key) => caches.delete(key)))),
  );
});

serwist.addEventListeners();
