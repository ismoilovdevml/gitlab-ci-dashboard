<script setup>
import { withBase } from 'vitepress'
</script>

# Overview and pipelines

## Overview

**Overview** is the start page. It answers "what is running and what just broke" across all your
projects.

![Overview page](/screenshots/overview.webp){.screenshot}

- **Status cards**: running, successful, failed, pending and total pipelines. Click a card to list
  the pipelines behind it.
- **Active Jobs**: jobs that are running or pending right now, from the active pipelines. Click a
  job to see its pipeline's jobs and logs.
- **Recent Builds**: the latest pipelines across projects, newest first. Click one to open its
  details.
- **Search** filters recent builds by project name, branch or pipeline ID.
- The **Live** badge shows the refresh interval. Change it, or turn auto-refresh off, in
  **Settings**.

The numbers cover the 20 most recently active projects that the token can see, with the latest
20 pipelines of each. Very large instances therefore see the recent picture, not all-time totals.

## Pipeline details

Opening a pipeline shows its branch, commit, duration, who triggered it and a stage graph with
every job. From here you can retry or cancel the pipeline, retry or cancel a single job, run a
manual job, and open a job's log. Actions need a token with the `api` scope.

![Pipeline details with stages](/screenshots/pipeline-details.webp){.screenshot}

## Pipelines page

**Pipelines** lists the pipelines of one project at a time. Pick the project on the left; the list
is filtered and paginated by GitLab, 20 per page.

![Pipelines page](/screenshots/pipelines.webp){.screenshot}

- **Status filter**: all, success, failed, running, pending, canceled
- **Time range**: last 24 hours, 7, 30 or 90 days, or last year (by last update)
- **Statistics** and the status chart describe the current page
- Each card links to the pipeline in GitLab and has retry or cancel, depending on its state

The light theme is available under **Settings → Preferences → Theme**:

![Pipelines page in the light theme](/screenshots/pipelines-light.webp){.screenshot}

## On phones and small screens

Below 1024 px the sidebar turns into a drawer. A top bar shows the current page and a menu button;
the drawer closes when you pick a page, tap outside it or press <kbd>Esc</kbd>. Cards and tables
reflow into fewer columns, and wide tables scroll sideways.

<div class="phone-shots">
  <img :src="withBase('/screenshots/overview-mobile.webp')" alt="Overview on a phone" width="390" height="844" />
  <img :src="withBase('/screenshots/nav-mobile.webp')" alt="Navigation drawer open on a phone" width="390" height="844" />
</div>
