import { defineConfig } from 'vitepress'

const repo = 'https://github.com/ismoilovdevml/gitlab-ci-dashboard'

export default defineConfig({
  title: 'GitLab CI/CD Dashboard',
  description:
    'Self-hosted dashboard for GitLab CI/CD pipelines, jobs, runners, artifacts and alerts.',
  base: '/gitlab-ci-dashboard/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/gitlab-ci-dashboard/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#fc6d26' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'GitLab CI/CD Dashboard' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Self-hosted dashboard for GitLab CI/CD pipelines, jobs, runners, artifacts and alerts.',
      },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'GitLab CI/CD Dashboard',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Features', link: '/features/pipelines', activeMatch: '/features/' },
      { text: 'Deployment', link: '/guide/deployment' },
      {
        text: 'Links',
        items: [
          { text: 'Releases', link: `${repo}/releases` },
          { text: 'Docker Hub', link: 'https://hub.docker.com/r/ismoilovdevml/gitlab-ci-dashboard' },
          { text: 'Issues', link: `${repo}/issues` },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Connecting GitLab', link: '/guide/connecting-gitlab' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Overview and pipelines', link: '/features/pipelines' },
          { text: 'Jobs and logs', link: '/features/jobs-and-logs' },
          { text: 'Projects', link: '/features/projects' },
          { text: 'Runners', link: '/features/runners' },
          { text: 'Analytics and DORA', link: '/features/analytics' },
          { text: 'Artifacts', link: '/features/artifacts' },
          { text: 'Container registry', link: '/features/registry' },
          { text: 'Alerting and webhooks', link: '/features/alerting' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Deployment', link: '/guide/deployment' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Project',
        items: [{ text: 'Contributing', link: '/guide/contributing' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    outline: { level: [2, 3] },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Otabek Ismoilov and contributors',
    },
  },
})
