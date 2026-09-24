# Analytics and DORA

**Analytics** shows the four [DORA metrics](https://dora.dev/guides/dora-metrics-four-keys/),
computed on the server from your GitLab data, with trend charts and a per-project breakdown.

![Analytics page with DORA metrics](/screenshots/analytics.webp){.screenshot}

- **Period**: last 7, 30 or 90 days.
- **Project**: all projects, or one project. Clicking a project in the table at the bottom selects
  it too.
- Every metric has a rating (elite, high, medium, low). When a period has nothing to measure, the
  metric shows no value and no rating instead of zero.

## What counts as a delivery

Each project is measured by one of two sources, shown in the **Measured by** column:

1. **Production deployments.** If the project has an environment on the `production` tier (GitLab
   sets the tier from names such as `production`, `prod` or `live`), every finished deployment
   (`success` or `failed`) to those environments is a delivery.
2. **Default-branch pipelines.** Projects without a production environment are measured by
   finished pipelines (`success` or `failed`) on their default branch.

Reading environments needs at least the Reporter role; without it the project falls back to its
default-branch pipelines.

## How each metric is measured

| Metric | How it is calculated | Rating |
|--------|----------------------|--------|
| Deployment frequency | Successful deliveries in the period divided by its length in days | elite ≥ 1/day, high ≥ 1/week, medium ≥ 1/month |
| Lead time for changes | Median time from the delivered commit's creation to the end of the successful delivery | elite < 1 h, high < 1 week, medium < 1 month |
| Mean time to recovery | Per environment (or branch): time from a failed delivery to the next successful one, averaged | elite < 1 h, high < 1 day, medium < 1 week |
| Change failure rate | Failed deliveries divided by all finished deliveries | elite ≤ 15 %, high ≤ 30 %, medium ≤ 45 % |

For pipelines, the commit time comes from the branch history (commits up to 30 days before the
period starts), so lead time needs read access to the repository.

## Trends

![DORA trend charts](/screenshots/analytics-trends.webp){.screenshot}

Three charts cover the same period: successful deliveries, median lead time in hours, and the
delivery success rate. Points are per day for 7 and 30 days, and per week for 90 days. Days
without deliveries are left out of the lead time and success rate charts rather than drawn as
zero.

## Limits and caching

- The all-projects view analyses at most the **25 most recently active projects** the token's
  user is a member of; projects without activity in the period are skipped.
- Per project, at most 500 deployments per environment or 500 pipelines are read. When a cap cuts
  data short, the page says so under the metrics.
- Results are cached in Redis for **2 minutes** per user, GitLab instance, project and period, so
  new deployments can take up to two minutes to show. If Redis is unavailable, the report is
  computed on every request.
- A project that cannot be read is skipped in the all-projects view and listed as
  **Not readable**.

## Recorded deployments and incidents

The older API for recording deployments and incidents in the database
(`POST /api/dora/deployments`, `POST /api/dora/incidents`) still exists. Metrics from those
records are available with `GET /api/dora/metrics?source=records`; the Analytics page does not use
them.
