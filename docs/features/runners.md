# Runners

**Runners** lists GitLab runners with their status, type, tags, platform, version and last
contact.

![Runners page](/screenshots/runners.webp){.screenshot}

- **Totals**: all, online, offline, paused, shared and dedicated runners.
- **Filters**: status (online, offline, paused) and type (instance, group, project), plus search.
- Click a runner for its details, the projects it is assigned to and its recent jobs.

Which runners you see depends on the token:

- **Admin token**: all runners of the instance (`GET /runners/all`).
- **Any other token**: runners assigned to your projects, collected from up to 20 projects and
  de-duplicated.

The list is cached in the browser for up to two minutes, and **Refresh** reads that cache too.
Reload the page to fetch it from GitLab immediately.
