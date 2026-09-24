'use client';

import { SerwistProvider, useSerwist } from '@serwist/turbopack/react';
import { type ReactNode, useEffect } from 'react';

export const SW_URL = '/serwist/sw.js';
const START_URL = '/';

// The page that registers the worker is loaded before the worker controls it, so ask the
// worker to fetch the dashboard shell once; it is kept only if the response is a real page.
function CacheStartUrl() {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist || !navigator.onLine) return;
    serwist.messageSW({ type: 'CACHE_URLS', payload: { urlsToCache: [START_URL] } }).catch(() => {});
  }, [serwist]);

  return null;
}

export default function PwaProvider({ children }: { children: ReactNode }) {
  // Some browsers and embedded webviews have no service worker support; Serwist would throw there.
  const supported = typeof navigator === 'undefined' || 'serviceWorker' in navigator;

  return (
    <SerwistProvider
      swUrl={SW_URL}
      disable={process.env.NODE_ENV === 'development' || !supported}
      // Classic worker: browsers fetch module worker scripts without credentials, so an
      // auth-gated script URL would redirect to /login. The bundle has no imports.
      options={{ type: 'classic' }}
    >
      <CacheStartUrl />
      {children}
    </SerwistProvider>
  );
}
