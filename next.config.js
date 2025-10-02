/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    GITLAB_URL: process.env.GITLAB_URL,
    GITLAB_TOKEN: process.env.GITLAB_TOKEN,
  },
}

module.exports = nextConfig
