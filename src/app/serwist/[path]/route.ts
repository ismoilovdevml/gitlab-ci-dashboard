import { createSerwistRoute } from '@serwist/turbopack';

// Bundles src/app/sw.ts with esbuild at build time and serves it as /serwist/sw.js (plus its
// source map). The route is fully static, so nothing is rebuilt per request in production.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
