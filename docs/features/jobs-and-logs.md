# Jobs and logs

## Jobs

Jobs appear in three places:

- **Overview → Active Jobs**: running and pending jobs across projects.
- **Pipeline details**: every job of a pipeline, grouped by stage in execution order, with its
  status and duration.
- **Runners → runner details**: the recent jobs a runner picked up.

![Jobs grouped by stage](/screenshots/pipeline-details.webp){.screenshot}

Job actions, all through GitLab's API and only with a token that has the `api` scope:

| Action | Available for |
|--------|---------------|
| Retry | successful and failed jobs |
| Cancel | running and pending jobs |
| Run | manual jobs |
| View logs | every job |

## Log viewer

Click the log icon on a job to open its log (GitLab's job trace, fetched through the server).

- **Search** filters the log to matching lines and highlights the match.
- **Errors**, **Warnings** and **Info** show only lines of that level. The level comes from the
  line's text (for example `error`, `failed`, `warning`, lines starting with `$`).
- The header counts lines and errors.
- **Download** saves the log as `<job name>-logs.txt`; the expand button switches to full screen.

::: info
The log viewer shows the trace as text. ANSI colour codes and GitLab's collapsible section
markers from the runner are not rendered yet and appear as raw text.
:::

To see the job in GitLab itself, use the external-link icon on the job or pipeline.
