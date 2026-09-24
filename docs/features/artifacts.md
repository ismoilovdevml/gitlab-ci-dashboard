# Artifacts

**Artifacts** lists recent jobs that produced artifacts, across projects, newest first.

![Artifacts page](/screenshots/artifacts.webp){.screenshot}

Each row shows the job, its project and branch, the artifact size and age.

- **Expand** a row to see the files.
- **Download** fetches `artifacts.zip` through the dashboard server, so the browser never needs a
  GitLab token. Downloads that GitLab redirects to object storage are followed; the token is only
  sent to the configured GitLab origin.
- **Delete** removes the job's artifacts in GitLab after a confirmation (needs the `api` scope).
- The external-link icon opens the job in GitLab.

The list covers the 20 most recently active projects: of the latest 10 successful or failed jobs
in each, those that have artifacts, up to 100 jobs in total. It is cached in the browser for two minutes.
