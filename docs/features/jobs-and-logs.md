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
| Run | manual jobs (starts them with GitLab's `play` endpoint) |
| View logs | every job |

## Log viewer

Click the log icon on a job to open its log (GitLab's job trace, fetched through the server).

![Job log viewer with colours and collapsible sections](/screenshots/job-log.webp){.screenshot}

- **Colours** from the runner are rendered as in GitLab: bold, dim, italic, underline, 16, 256 and
  24-bit colours. Progress output that rewrites a line (`\r`) shows its final state. Other escape
  sequences are dropped; log content is always shown as text, never as HTML.
- **Sections**: the runner's sections (`Preparing the "docker" executor`, `Getting source from Git
  repository`, `Executing "step_script" stage of the job script`, and sections your job defines)
  get a header with their duration and can be collapsed. Sections the job marks as
  `[collapsed=true]` start collapsed.
- **Search** shows only matching lines and highlights the match. **Errors**, **Warnings** and
  **Info** show only lines of that level, detected from keywords such as `error`, `failed`,
  `warning` and lines starting with `$`. While searching or filtering, sections are flattened so no
  match is hidden inside a collapsed section.
- The header counts lines, errors and warnings.
- **Running jobs** refresh every 3 seconds and follow the end of the log; scroll up to stop
  following.
- **Download** saves the log as `<job name>-logs.txt`; the expand button switches to full screen.

Long logs stay fast: only the lines in view are rendered.

To see the job in GitLab itself, use the external-link icon on the job or pipeline.
