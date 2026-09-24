# Analytics and DORA

**Analytics** shows the four [DORA metrics](https://dora.dev/guides/dora-metrics-four-keys/) with
a rating for each (elite, high, medium, low) for the last 7, 30 or 90 days:

| Metric | Unit | Meaning |
|--------|------|---------|
| Deployment frequency | per day | How often production deployments succeed |
| Lead time for changes | hours | Time from commit to running in production |
| Mean time to recovery | minutes | Time from a failure (incident) to its resolution |
| Change failure rate | % | Share of deployments that cause a failure |

![Analytics page](/screenshots/analytics.webp){.screenshot}

::: warning Current state
Analytics is the least mature part of the dashboard:

- The page shows the **all-projects** view, and the server does not aggregate that view yet: it
  returns `0` for every metric, as in the screenshot above.
- The metrics are computed from deployments and incidents stored in PostgreSQL. Nothing records
  them automatically yet; they are only written through the API
  (`POST /api/dora/deployments`, `POST /api/dora/incidents`).
- The trend charts stay hidden.

Progress is tracked in the
[issue tracker](https://github.com/ismoilovdevml/gitlab-ci-dashboard/issues). For pipeline
success rates and durations today, use [Overview and pipelines](./pipelines).
:::
