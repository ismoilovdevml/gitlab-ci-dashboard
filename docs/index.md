---
layout: home

hero:
  name: GitLab CI/CD Dashboard
  text: One view of every pipeline
  tagline: A self-hosted dashboard for GitLab CI/CD. Pipelines, jobs, runners, artifacts, registry and alerts across all your projects, running on your own server.
  image:
    src: /logo.svg
    alt: GitLab CI/CD Dashboard
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/ismoilovdevml/gitlab-ci-dashboard

features:
  - title: Pipelines across projects
    details: Running, pending and failed pipelines from all your projects on one page, with stage graphs, retry and cancel.
    link: /features/pipelines
  - title: Jobs and logs
    details: Active jobs, per-stage job status and a searchable log viewer with error and warning filters.
    link: /features/jobs-and-logs
  - title: Runners
    details: Online, offline and paused runners, their tags, versions, projects and recent jobs.
    link: /features/runners
  - title: Artifacts and registry
    details: Browse, download and delete job artifacts and container registry tags without opening every project.
    link: /features/artifacts
  - title: Alerts from GitLab webhooks
    details: GitLab events forwarded to Slack, Telegram or Discord, with a delivery history.
    link: /features/alerting
  - title: Your server, your token
    details: The GitLab token is encrypted in PostgreSQL and never sent to the browser. MIT licensed, no accounts outside your install.
    link: /guide/security
---

<script setup>
import { withBase } from 'vitepress'
</script>

<div class="home-shot">
  <img class="dark-only" :src="withBase('/screenshots/overview.webp')" alt="Dashboard overview in the dark theme" width="1440" height="900" />
  <img class="light-only" :src="withBase('/screenshots/overview-light.webp')" alt="Dashboard overview in the light theme" width="1440" height="900" />
</div>
