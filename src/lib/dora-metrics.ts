import { createHash } from 'crypto';
import { z } from 'zod';
import type prisma from './db/prisma';
import { GitLabCredentialsError, gitLabAuthHeaders, type GitLabCredentials } from './gitlab/credentials';
import { logger } from './logger';
import { calculateChangePercent, calculateTrend } from './trend-analysis';

/**
 * Org-scoped Prisma client from getOrgPrisma()/getScopedPrisma(). Callers must pass the
 * scoped client so reads and writes stay inside the caller's organization.
 */
export type DbClient = typeof prisma;

export interface DoraMetrics {
  projectId: number;
  projectName: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  deploymentFrequency: {
    count: number;
    perDay: number;
    rating: 'elite' | 'high' | 'medium' | 'low';
  };
  leadTimeForChanges: {
    average: number;
    median: number;
    rating: 'elite' | 'high' | 'medium' | 'low';
  };
  meanTimeToRecovery: {
    average: number;
    incidentCount: number;
    rating: 'elite' | 'high' | 'medium' | 'low';
  };
  changeFailureRate: {
    rate: number;
    failedCount: number;
    totalCount: number;
    rating: 'elite' | 'high' | 'medium' | 'low';
  };
}

/**
 * Calculate Deployment Frequency rating
 * Elite: Multiple deploys per day
 * High: Between once per day and once per week
 * Medium: Between once per week and once per month
 * Low: Less than once per month
 */
function rateDeploymentFrequency(perDay: number): 'elite' | 'high' | 'medium' | 'low' {
  if (perDay >= 1) return 'elite';
  if (perDay >= 1 / 7) return 'high';
  if (perDay >= 1 / 30) return 'medium';
  return 'low';
}

/**
 * Calculate Lead Time rating (in hours)
 * Elite: Less than one hour
 * High: Between one day and one week
 * Medium: Between one week and one month
 * Low: More than one month
 */
function rateLeadTime(hours: number): 'elite' | 'high' | 'medium' | 'low' {
  if (hours < 1) return 'elite';
  if (hours < 24 * 7) return 'high';
  if (hours < 24 * 30) return 'medium';
  return 'low';
}

/**
 * Calculate MTTR rating (in hours)
 * Elite: Less than one hour
 * High: Less than one day
 * Medium: Between one day and one week
 * Low: More than one week
 */
function rateMTTR(hours: number): 'elite' | 'high' | 'medium' | 'low' {
  if (hours < 1) return 'elite';
  if (hours < 24) return 'high';
  if (hours < 24 * 7) return 'medium';
  return 'low';
}

/**
 * Calculate Change Failure Rate rating
 * Elite: 0-15%
 * High: 16-30%
 * Medium: 31-45%
 * Low: >45%
 */
function rateChangeFailureRate(rate: number): 'elite' | 'high' | 'medium' | 'low' {
  if (rate <= 15) return 'elite';
  if (rate <= 30) return 'high';
  if (rate <= 45) return 'medium';
  return 'low';
}

/**
 * Calculate median value
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

/**
 * Calculate DORA metrics for a project
 */
export async function calculateDoraMetrics(
  db: DbClient,
  projectId: number,
  projectName: string,
  startDate: Date,
  endDate: Date,
  period: string = 'monthly'
): Promise<DoraMetrics> {
  try {
    // Calculate deployment frequency
    const deployments = await db.deployment.findMany({
      where: {
        projectId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
        environment: 'production',
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    const successfulDeployments = deployments.filter((d) => d.status === 'success');
    const failedDeployments = deployments.filter((d) => d.status === 'failed');

    const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const deploymentsPerDay = deployments.length / daysDiff;

    // Calculate lead time for changes (commit to deployment time)
    const leadTimes = successfulDeployments
      .filter((d) => d.duration)
      .map((d) => d.duration!);

    const avgLeadTime = leadTimes.length > 0
      ? leadTimes.reduce((sum: number, val: number) => sum + val, 0) / leadTimes.length
      : 0;

    const medianLeadTime = calculateMedian(leadTimes);

    // Calculate mean time to recovery
    const incidents = await db.incident.findMany({
      where: {
        projectId,
        detectedAt: {
          gte: startDate,
          lte: endDate,
        },
        affectedEnv: 'production',
        status: {
          in: ['resolved', 'closed'],
        },
      },
    });

    const recoveryTimes = incidents
      .filter((i) => i.duration)
      .map((i) => i.duration!);

    const avgMttr = recoveryTimes.length > 0
      ? recoveryTimes.reduce((sum: number, val: number) => sum + val, 0) / recoveryTimes.length
      : 0;

    // Calculate change failure rate
    const changeFailureRate = deployments.length > 0
      ? (failedDeployments.length / deployments.length) * 100
      : 0;

    // Save to database
    // Upsert DORA metric — find existing record or create new
    const existing = await db.doraMetric.findFirst({
      where: { projectId, period, periodStart: startDate },
    });

    const metricData = {
      deploymentCount: deployments.length,
      deploymentFreq: deploymentsPerDay,
      avgLeadTime: Math.round(avgLeadTime),
      medianLeadTime: Math.round(medianLeadTime),
      incidentCount: incidents.length,
      avgMttr: Math.round(avgMttr),
      failedDeployments: failedDeployments.length,
      failureRate: changeFailureRate,
    };

    if (existing) {
      await db.doraMetric.update({
        where: { id: existing.id },
        data: { ...metricData, calculatedAt: new Date() },
      });
    } else {
      await db.doraMetric.create({
        data: {
          projectId,
          projectName,
          period,
          periodStart: startDate,
          periodEnd: endDate,
          ...metricData,
        },
      });
    }

    return {
      projectId,
      projectName,
      period,
      periodStart: startDate,
      periodEnd: endDate,
      deploymentFrequency: {
        count: deployments.length,
        perDay: deploymentsPerDay,
        rating: rateDeploymentFrequency(deploymentsPerDay),
      },
      leadTimeForChanges: {
        average: avgLeadTime,
        median: medianLeadTime,
        rating: rateLeadTime(avgLeadTime / 3600), // convert to hours
      },
      meanTimeToRecovery: {
        average: avgMttr,
        incidentCount: incidents.length,
        rating: rateMTTR(avgMttr / 3600), // convert to hours
      },
      changeFailureRate: {
        rate: changeFailureRate,
        failedCount: failedDeployments.length,
        totalCount: deployments.length,
        rating: rateChangeFailureRate(changeFailureRate),
      },
    };
  } catch (error) {
    logger.error('Failed to calculate DORA metrics', { projectId, error });
    throw error;
  }
}

/**
 * Track deployment from pipeline
 */
export async function trackDeployment(
  db: DbClient,
  projectId: number,
  projectName: string,
  pipelineId: number,
  environment: string,
  status: string,
  startedAt: Date,
  finishedAt: Date | null,
  commitSha: string,
  ref: string,
  triggeredBy: string | null
): Promise<void> {
  try {
    const duration = finishedAt
      ? Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)
      : null;

    await db.deployment.create({
      data: {
        projectId,
        projectName,
        pipelineId,
        environment,
        status,
        startedAt,
        finishedAt,
        duration,
        commitSha,
        ref,
        triggeredBy,
      },
    });

    logger.info('Deployment tracked', {
      projectId,
      pipelineId,
      environment,
      status,
    });
  } catch (error) {
    logger.error('Failed to track deployment', { projectId, pipelineId, error });
  }
}

/**
 * Create incident
 */
export async function createIncident(
  db: DbClient,
  projectId: number,
  projectName: string,
  title: string,
  severity: string,
  affectedEnv: string,
  detectedAt: Date,
  createdBy: string | null
): Promise<string> {
  try {
    const incident = await db.incident.create({
      data: {
        projectId,
        projectName,
        title,
        severity,
        status: 'open',
        detectedAt,
        affectedEnv,
        createdBy,
      },
    });

    logger.info('Incident created', {
      incidentId: incident.id,
      projectId,
      severity,
    });

    return incident.id;
  } catch (error) {
    logger.error('Failed to create incident', { projectId, error });
    throw error;
  }
}

/**
 * Resolve incident
 */
export async function resolveIncident(
  db: DbClient,
  incidentId: string,
  rootCause?: string
): Promise<void> {
  try {
    const incident = await db.incident.findFirst({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    const resolvedAt = new Date();
    const duration = Math.round(
      (resolvedAt.getTime() - incident.detectedAt.getTime()) / 1000
    );

    await db.incident.update({
      where: { id: incidentId },
      data: {
        status: 'resolved',
        resolvedAt,
        duration,
        rootCause,
      },
    });

    logger.info('Incident resolved', {
      incidentId,
      duration,
    });
  } catch (error) {
    logger.error('Failed to resolve incident', { incidentId, error });
    throw error;
  }
}

/**
 * Get DORA metrics for multiple projects
 */
export async function getDoraMetricsSummary(
  db: DbClient,
  projectIds: number[],
  period: string = 'monthly'
): Promise<DoraMetrics[]> {
  const metrics: DoraMetrics[] = [];

  for (const projectId of projectIds) {
    const latestMetric = await db.doraMetric.findFirst({
      where: { projectId, period },
      orderBy: { periodStart: 'desc' },
    });

    if (latestMetric) {
      metrics.push({
        projectId: latestMetric.projectId,
        projectName: latestMetric.projectName,
        period: latestMetric.period,
        periodStart: latestMetric.periodStart,
        periodEnd: latestMetric.periodEnd,
        deploymentFrequency: {
          count: latestMetric.deploymentCount,
          perDay: latestMetric.deploymentFreq,
          rating: rateDeploymentFrequency(latestMetric.deploymentFreq),
        },
        leadTimeForChanges: {
          average: latestMetric.avgLeadTime,
          median: latestMetric.medianLeadTime,
          rating: rateLeadTime(latestMetric.avgLeadTime / 3600),
        },
        meanTimeToRecovery: {
          average: latestMetric.avgMttr,
          incidentCount: latestMetric.incidentCount,
          rating: rateMTTR(latestMetric.avgMttr / 3600),
        },
        changeFailureRate: {
          rate: latestMetric.failureRate,
          failedCount: latestMetric.failedDeployments,
          totalCount: latestMetric.deploymentCount,
          rating: rateChangeFailureRate(latestMetric.failureRate),
        },
      });
    }
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// DORA metrics computed from GitLab
// ---------------------------------------------------------------------------

export type DoraRating = 'elite' | 'high' | 'medium' | 'low';

export const DORA_PERIODS = ['7d', '30d', '90d'] as const;
export type DoraPeriod = (typeof DORA_PERIODS)[number];

const PERIOD_DAYS: Record<DoraPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Projects analysed in the all-projects view, most recently active first. */
export const DORA_MAX_PROJECTS = 25;
const PROJECT_CONCURRENCY = 4;
const PER_PAGE = 100;
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15_000;
/** Lead time only resolves commits made up to this long before the period starts. */
const COMMIT_LOOKBACK_MS = 30 * DAY_MS;
export const DORA_CACHE_TTL_SECONDS = 120;
const CACHE_VERSION = 'v1';

export const DORA_TREND_METRICS = ['deployment_frequency', 'lead_time', 'success_rate'] as const;
export type DoraTrendMetric = (typeof DORA_TREND_METRICS)[number];

export function isDoraTrendMetric(metric: string): metric is DoraTrendMetric {
  return (DORA_TREND_METRICS as readonly string[]).includes(metric);
}

const optionalPositiveInt = z.coerce.number().int().positive().optional();

/** Query for `GET /api/dora/metrics` (GitLab source). */
export const doraMetricsQuerySchema = z.object({
  period: z.enum(DORA_PERIODS).default('30d'),
  projectId: optionalPositiveInt,
});

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' });

const metricName = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** Query for `GET /api/trends`. DORA metric names come from GitLab; any other name reads recorded trend data. */
export const trendsQuerySchema = z
  .object({
    metric: metricName.optional(),
    metrics: z
      .string()
      .max(500)
      .transform((value) => value.split(',').map((m) => m.trim()).filter(Boolean))
      .pipe(z.array(metricName).min(1).max(10))
      .optional(),
    period: z.enum(DORA_PERIODS).default('30d'),
    projectId: optionalPositiveInt,
    startDate: isoDateString.optional(),
    endDate: isoDateString.optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
  })
  .refine((q) => q.metric !== undefined || q.metrics !== undefined, {
    message: 'metric or metrics parameter required',
  });

/** Collect the given search params into a plain object, dropping absent ones, for zod parsing. */
export function searchParamsToObject(params: URLSearchParams, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value !== '') out[key] = value;
  }
  return out;
}

/** A finished deployment (or default-branch pipeline when a project has no production environment). */
export interface DeliveryEvent {
  /** Deliveries in the same stream (environment or branch) recover each other's failures. */
  stream: string;
  status: 'success' | 'failed';
  finishedAt: number;
  /** Creation time of the delivered commit; null when GitLab did not return it. */
  commitAt: number | null;
}

export interface DoraWindow {
  start: number;
  end: number;
}

export interface GitLabDoraValues {
  deploymentFrequency: { perDay: number | null; count: number; rating: DoraRating | null };
  leadTime: { medianSeconds: number | null; averageSeconds: number | null; samples: number; rating: DoraRating | null };
  mttr: { averageSeconds: number | null; recoveries: number; rating: DoraRating | null };
  changeFailureRate: { rate: number | null; failed: number; total: number; rating: DoraRating | null };
}

export type DoraProjectSource = 'deployments' | 'pipelines' | 'none' | 'error';

export interface DoraProjectSummary {
  id: number;
  name: string;
  source: DoraProjectSource;
  successCount: number;
  failedCount: number;
}

export interface GitLabDoraMetrics extends GitLabDoraValues {
  scope: 'all' | 'project';
  projectId: number | null;
  period: DoraPeriod;
  periodStart: string;
  periodEnd: string;
  projects: DoraProjectSummary[];
  /** True when the project cap or the page cap cut the data short. */
  truncated: boolean;
}

export interface DoraTrendPoint {
  timestamp: string;
  value: number;
}

export interface DoraTrend {
  metric: DoraTrendMetric;
  data: DoraTrendPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface DoraReport {
  metrics: GitLabDoraMetrics;
  trends: Record<DoraTrendMetric, DoraTrend>;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function leadTimeSeconds(event: DeliveryEvent): number | null {
  if (event.status !== 'success' || event.commitAt === null || event.finishedAt < event.commitAt) return null;
  return (event.finishedAt - event.commitAt) / 1000;
}

function eventsInWindow(events: DeliveryEvent[], window: DoraWindow): DeliveryEvent[] {
  return events.filter((e) => e.finishedAt >= window.start && e.finishedAt <= window.end);
}

/**
 * Compute the four DORA values from finished deliveries inside `window`.
 * A value is null when there is nothing to measure, so no rating is shown for absent data.
 */
export function computeDoraValues(events: DeliveryEvent[], window: DoraWindow): GitLabDoraValues {
  const inWindow = eventsInWindow(events, window);
  const successes = inWindow.filter((e) => e.status === 'success');
  const failed = inWindow.length - successes.length;
  const days = Math.max(1, (window.end - window.start) / DAY_MS);

  const perDay = inWindow.length > 0 ? successes.length / days : null;

  const leadTimes = successes.map(leadTimeSeconds).filter((v): v is number => v !== null);
  const medianLead = leadTimes.length > 0 ? calculateMedian(leadTimes) : null;

  // A failure opens an outage on its stream; the next success on that stream closes it.
  const recoveries: number[] = [];
  const byStream = new Map<string, DeliveryEvent[]>();
  for (const e of inWindow) {
    const list = byStream.get(e.stream) ?? [];
    list.push(e);
    byStream.set(e.stream, list);
  }
  for (const list of byStream.values()) {
    list.sort((a, b) => a.finishedAt - b.finishedAt);
    let failingSince: number | null = null;
    for (const e of list) {
      if (e.status === 'failed') {
        failingSince ??= e.finishedAt;
      } else if (failingSince !== null) {
        recoveries.push((e.finishedAt - failingSince) / 1000);
        failingSince = null;
      }
    }
  }
  const mttr = recoveries.length > 0 ? average(recoveries) : null;

  const rate = inWindow.length > 0 ? (failed / inWindow.length) * 100 : null;

  return {
    deploymentFrequency: {
      perDay: perDay === null ? null : round(perDay, 3),
      count: successes.length,
      rating: perDay === null ? null : rateDeploymentFrequency(perDay),
    },
    leadTime: {
      medianSeconds: medianLead === null ? null : Math.round(medianLead),
      averageSeconds: leadTimes.length > 0 ? Math.round(average(leadTimes)) : null,
      samples: leadTimes.length,
      rating: medianLead === null ? null : rateLeadTime(medianLead / 3600),
    },
    mttr: {
      averageSeconds: mttr === null ? null : Math.round(mttr),
      recoveries: recoveries.length,
      rating: mttr === null ? null : rateMTTR(mttr / 3600),
    },
    changeFailureRate: {
      rate: rate === null ? null : round(rate, 1),
      failed,
      total: inWindow.length,
      rating: rate === null ? null : rateChangeFailureRate(rate),
    },
  };
}

function toTrend(metric: DoraTrendMetric, data: DoraTrendPoint[]): DoraTrend {
  const values = data.map((p) => p.value);
  return {
    metric,
    data,
    trend: calculateTrend(values),
    changePercent: round(calculateChangePercent(values), 1),
  };
}

/** Bucket size for trend charts: daily up to a month, weekly beyond. */
export function trendBucketMs(window: DoraWindow): number {
  return window.end - window.start > 31 * DAY_MS ? 7 * DAY_MS : DAY_MS;
}

/**
 * Per-bucket series for the trend charts: successful deliveries, median lead time (hours) and
 * success rate (%). Buckets without deliveries are left out of lead time and success rate rather than
 * plotted as zero; every series is empty when the window has no deliveries at all.
 */
export function computeDoraTrends(
  events: DeliveryEvent[],
  window: DoraWindow,
  bucketMs: number = trendBucketMs(window)
): Record<DoraTrendMetric, DoraTrend> {
  const inWindow = eventsInWindow(events, window);
  const bucketCount = Math.max(1, Math.ceil((window.end - window.start) / bucketMs));
  const buckets = Array.from({ length: bucketCount }, () => ({ success: 0, total: 0, lead: [] as number[] }));

  for (const e of inWindow) {
    const index = Math.min(bucketCount - 1, Math.floor((e.finishedAt - window.start) / bucketMs));
    const bucket = buckets[index];
    bucket.total += 1;
    if (e.status === 'success') bucket.success += 1;
    const lead = leadTimeSeconds(e);
    if (lead !== null) bucket.lead.push(lead);
  }

  const frequency: DoraTrendPoint[] = [];
  const leadTime: DoraTrendPoint[] = [];
  const successRate: DoraTrendPoint[] = [];

  if (inWindow.length > 0) {
    buckets.forEach((bucket, i) => {
      const timestamp = new Date(window.start + i * bucketMs).toISOString();
      frequency.push({ timestamp, value: bucket.success });
      if (bucket.lead.length > 0) {
        leadTime.push({ timestamp, value: round(calculateMedian(bucket.lead) / 3600) });
      }
      if (bucket.total > 0) {
        successRate.push({ timestamp, value: round((bucket.success / bucket.total) * 100, 1) });
      }
    });
  }

  return {
    deployment_frequency: toTrend('deployment_frequency', frequency),
    lead_time: toTrend('lead_time', leadTime),
    success_rate: toTrend('success_rate', successRate),
  };
}

// --- GitLab access ---------------------------------------------------------

/** A GitLab API call failed. `status` is null for network errors and timeouts. */
export class GitLabRequestError extends Error {
  readonly status: number | null;

  constructor(status: number | null, message: string) {
    super(message);
    this.name = 'GitLabRequestError';
    this.status = status;
  }
}

type QueryValue = string | number | boolean | undefined;

async function gitlabGet<T>(
  credentials: GitLabCredentials,
  path: string,
  params: Record<string, QueryValue>
): Promise<{ data: T; nextPage: number | null }> {
  const url = new URL(`${credentials.baseUrl}/api/v4/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { ...gitLabAuthHeaders(credentials), Accept: 'application/json' },
      // A followed redirect would carry the PRIVATE-TOKEN header to wherever it points.
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GitLabRequestError(null, `GitLab request failed: ${path}`);
  }

  if (!response.ok) {
    throw new GitLabRequestError(response.status, `GitLab responded ${response.status}: ${path}`);
  }

  const next = Number(response.headers.get('x-next-page'));
  return {
    data: (await response.json()) as T,
    nextPage: Number.isInteger(next) && next > 0 ? next : null,
  };
}

async function gitlabGetAll<T>(
  credentials: GitLabCredentials,
  path: string,
  params: Record<string, QueryValue>,
  maxPages: number = MAX_PAGES
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = 1;
  for (let i = 0; i < maxPages; i++) {
    const { data, nextPage } = await gitlabGet<T[]>(credentials, path, { ...params, per_page: PER_PAGE, page });
    if (!Array.isArray(data)) return { items, truncated: false };
    items.push(...data);
    if (nextPage === null) return { items, truncated: false };
    page = nextPage;
  }
  return { items, truncated: true };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface GlProject {
  id: number;
  name: string;
  default_branch?: string | null;
}

export interface GlEnvironment {
  id: number;
  name: string;
  tier?: string | null;
}

interface GlCommit {
  id?: string;
  created_at?: string | null;
  committed_date?: string | null;
}

interface GlDeployment {
  id: number;
  status: string;
  updated_at: string;
  finished_at?: string | null;
  deployable?: { finished_at?: string | null; commit?: GlCommit | null } | null;
}

interface GlPipeline {
  id: number;
  sha: string;
  status: string;
  updated_at: string;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function commitTime(commit: GlCommit | null | undefined): number | null {
  return parseTime(commit?.created_at ?? commit?.committed_date);
}

/**
 * GitLab derives `tier` from the environment name (production, prod, live, ...); instances without
 * tiers fall back to the name.
 */
export function isProductionEnvironment(env: GlEnvironment): boolean {
  if (env.tier) return env.tier === 'production';
  return /^(prod|production|live)([/_-]|$)/i.test(env.name);
}

function isFinished(status: string): status is 'success' | 'failed' {
  return status === 'success' || status === 'failed';
}

function isAccessDenied(error: unknown): boolean {
  return error instanceof GitLabRequestError && (error.status === 403 || error.status === 404);
}

interface ProjectEvents {
  source: DoraProjectSource;
  events: DeliveryEvent[];
  truncated: boolean;
}

async function listProductionEnvironments(credentials: GitLabCredentials, projectId: number): Promise<GlEnvironment[]> {
  try {
    const { items } = await gitlabGetAll<GlEnvironment>(credentials, `projects/${projectId}/environments`, {}, 2);
    return items.filter(isProductionEnvironment);
  } catch (error) {
    // Environments need Reporter access; without it the pipeline fallback still works.
    if (isAccessDenied(error)) return [];
    throw error;
  }
}

async function deploymentEvents(
  credentials: GitLabCredentials,
  projectId: number,
  environments: GlEnvironment[],
  window: DoraWindow
): Promise<{ events: DeliveryEvent[]; truncated: boolean }> {
  const events: DeliveryEvent[] = [];
  let truncated = false;
  for (const env of environments) {
    const result = await gitlabGetAll<GlDeployment>(credentials, `projects/${projectId}/deployments`, {
      environment: env.name,
      order_by: 'updated_at',
      sort: 'asc',
      updated_after: new Date(window.start).toISOString(),
      updated_before: new Date(window.end).toISOString(),
    });
    truncated ||= result.truncated;
    for (const d of result.items) {
      if (!isFinished(d.status)) continue;
      const finishedAt = parseTime(d.finished_at ?? d.deployable?.finished_at ?? d.updated_at);
      if (finishedAt === null) continue;
      events.push({
        stream: `${projectId}:env:${env.id}`,
        status: d.status,
        finishedAt,
        commitAt: commitTime(d.deployable?.commit),
      });
    }
  }
  return { events, truncated };
}

async function pipelineEvents(
  credentials: GitLabCredentials,
  projectId: number,
  branch: string,
  window: DoraWindow
): Promise<{ events: DeliveryEvent[]; truncated: boolean }> {
  const result = await gitlabGetAll<GlPipeline>(credentials, `projects/${projectId}/pipelines`, {
    ref: branch,
    order_by: 'updated_at',
    sort: 'asc',
    updated_after: new Date(window.start).toISOString(),
    updated_before: new Date(window.end).toISOString(),
  });
  const finished = result.items.filter((p) => isFinished(p.status));
  if (finished.length === 0) return { events: [], truncated: result.truncated };

  // Pipeline lists only carry the SHA; commit times come from the branch history.
  const commitTimes = new Map<string, number>();
  try {
    const commits = await gitlabGetAll<GlCommit>(
      credentials,
      `projects/${projectId}/repository/commits`,
      {
        ref_name: branch,
        since: new Date(window.start - COMMIT_LOOKBACK_MS).toISOString(),
        until: new Date(window.end).toISOString(),
      },
      3
    );
    for (const c of commits.items) {
      const t = commitTime(c);
      if (c.id && t !== null) commitTimes.set(c.id, t);
    }
  } catch (error) {
    // Lead time is then unavailable for this project; the other metrics still are.
    if (!isAccessDenied(error)) throw error;
  }

  const events: DeliveryEvent[] = [];
  for (const p of finished) {
    // Pipeline lists have no finished_at; a finished pipeline's updated_at is its completion time.
    const finishedAt = parseTime(p.updated_at);
    if (finishedAt === null) continue;
    events.push({
      stream: `${projectId}:ref:${branch}`,
      status: p.status as 'success' | 'failed',
      finishedAt,
      commitAt: commitTimes.get(p.sha) ?? null,
    });
  }
  return { events, truncated: result.truncated };
}

/**
 * Deliveries of one project: deployments to its production environments, or finished pipelines on
 * the default branch when it has no production environment.
 */
async function collectProjectEvents(
  credentials: GitLabCredentials,
  project: GlProject,
  window: DoraWindow
): Promise<ProjectEvents> {
  const environments = await listProductionEnvironments(credentials, project.id);
  if (environments.length > 0) {
    const result = await deploymentEvents(credentials, project.id, environments, window);
    return { source: 'deployments', ...result };
  }
  if (!project.default_branch) return { source: 'none', events: [], truncated: false };
  const result = await pipelineEvents(credentials, project.id, project.default_branch, window);
  return { source: 'pipelines', ...result };
}

export function doraWindow(period: DoraPeriod, now: number = Date.now()): DoraWindow {
  return { start: now - PERIOD_DAYS[period] * DAY_MS, end: now };
}

export interface GitLabDoraRequest {
  credentials: GitLabCredentials;
  organizationId: string | null;
  userId: string;
  period: DoraPeriod;
  projectId?: number;
}

/** Fetch deliveries from GitLab and compute metrics and trends (uncached; see getGitLabDoraReport). */
export async function computeGitLabDoraReport(
  request: Pick<GitLabDoraRequest, 'credentials' | 'period' | 'projectId'>,
  now: number = Date.now()
): Promise<DoraReport> {
  const { credentials, period, projectId } = request;
  const window = doraWindow(period, now);

  let projects: GlProject[];
  let truncated = false;
  if (projectId !== undefined) {
    const { data } = await gitlabGet<GlProject>(credentials, `projects/${projectId}`, {});
    projects = [data];
  } else {
    const { data, nextPage } = await gitlabGet<GlProject[]>(credentials, 'projects', {
      membership: true,
      archived: false,
      simple: true,
      order_by: 'last_activity_at',
      sort: 'desc',
      // A project idle for the whole period cannot have delivered anything in it.
      last_activity_after: new Date(window.start).toISOString(),
      per_page: DORA_MAX_PROJECTS,
      page: 1,
    });
    projects = Array.isArray(data) ? data : [];
    truncated = nextPage !== null;
  }

  const perProject = await mapWithConcurrency(projects, PROJECT_CONCURRENCY, async (project): Promise<ProjectEvents> => {
    try {
      return await collectProjectEvents(credentials, project, window);
    } catch (error) {
      // One unreadable project must not hide the others; a single-project request reports the error.
      if (projectId !== undefined) throw error;
      logger.warn('DORA: skipped project', {
        projectId: project.id,
        status: error instanceof GitLabRequestError ? error.status : undefined,
      });
      return { source: 'error', events: [], truncated: false };
    }
  });

  const events = perProject.flatMap((p) => p.events);
  truncated ||= perProject.some((p) => p.truncated);

  const summaries: DoraProjectSummary[] = projects.map((project, i) => {
    const projectEvents = eventsInWindow(perProject[i].events, window);
    return {
      id: project.id,
      name: project.name,
      source: perProject[i].source,
      successCount: projectEvents.filter((e) => e.status === 'success').length,
      failedCount: projectEvents.filter((e) => e.status === 'failed').length,
    };
  });

  return {
    metrics: {
      scope: projectId !== undefined ? 'project' : 'all',
      projectId: projectId ?? null,
      period,
      periodStart: new Date(window.start).toISOString(),
      periodEnd: new Date(window.end).toISOString(),
      ...computeDoraValues(events, window),
      projects: summaries,
      truncated,
    },
    trends: computeDoraTrends(events, window),
  };
}

/** Redis key per org + user + GitLab instance + project + period. The token never enters the key. */
export function doraCacheKey(
  request: Pick<GitLabDoraRequest, 'organizationId' | 'userId' | 'period' | 'projectId'> & { baseUrl: string }
): string {
  const instance = createHash('sha256').update(request.baseUrl).digest('hex').slice(0, 12);
  return [
    'dora',
    CACHE_VERSION,
    request.organizationId ?? 'none',
    request.userId,
    instance,
    request.projectId ?? 'all',
    request.period,
  ].join(':');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * DORA report from GitLab, cached in Redis for a short time. A Redis failure degrades to an
 * uncached computation; GitLab failures propagate.
 */
export async function getGitLabDoraReport(request: GitLabDoraRequest): Promise<DoraReport> {
  const key = doraCacheKey({ ...request, baseUrl: request.credentials.baseUrl });
  // Imported lazily so modules that only use the DB helpers do not open a Redis connection.
  const { redis } = await import('./db/redis');

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as DoraReport;
  } catch (error) {
    logger.warn('DORA cache read failed', { error: errorMessage(error) });
  }

  const report = await computeGitLabDoraReport(request);

  try {
    await redis.setex(key, DORA_CACHE_TTL_SECONDS, JSON.stringify(report));
  } catch (error) {
    logger.warn('DORA cache write failed', { error: errorMessage(error) });
  }
  return report;
}

export interface DoraErrorDescription {
  status: number;
  code: string;
  message: string;
}

/** Map an error from reading GitLab credentials or data to an HTTP answer; null for unexpected errors. */
export function describeDoraError(error: unknown, scope: 'all' | 'project'): DoraErrorDescription | null {
  if (error instanceof GitLabCredentialsError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (!(error instanceof GitLabRequestError)) return null;
  if (error.status === null) {
    return { status: 504, code: 'GITLAB_UNREACHABLE', message: 'GitLab did not respond in time.' };
  }
  if (error.status === 401) {
    return {
      status: 502,
      code: 'GITLAB_AUTH_FAILED',
      message: 'GitLab rejected the stored access token. Update it in Settings.',
    };
  }
  if (scope === 'project' && (error.status === 403 || error.status === 404)) {
    return { status: 404, code: 'PROJECT_NOT_FOUND', message: 'Project not found or not accessible.' };
  }
  return { status: 502, code: 'GITLAB_ERROR', message: 'GitLab returned an error while loading DORA data.' };
}
