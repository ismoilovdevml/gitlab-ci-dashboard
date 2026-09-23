// The service worker is bundled by a Serwist route handler (src/app/serwist/[path]/route.ts),
// so builds run on Turbopack. withSerwist only marks esbuild as a server external package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSerwist } = require('@serwist/turbopack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Keep `next dev` from writing AGENTS.md/CLAUDE.md into the repository root.
  agentRules: false,
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
}

module.exports = withSerwist(nextConfig)
