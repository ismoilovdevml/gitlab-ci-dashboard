import { useState, useEffect } from 'react';
import axios from 'axios';

export type DoraRating = 'elite' | 'high' | 'medium' | 'low';
export type DoraPeriod = '7d' | '30d' | '90d';

export interface DoraMetric {
  name: string;
  /** Formatted value; null when there is nothing to measure in the period. */
  value: string | null;
  unit: string;
  rating: DoraRating | null;
  /** Short context line, e.g. "12 of 80 failed" or "No failures in period". */
  detail?: string;
  icon: 'activity' | 'clock' | 'alert' | 'target';
}

export type DoraProjectSource = 'deployments' | 'pipelines' | 'none' | 'error';

export interface DoraProjectSummary {
  id: number;
  name: string;
  source: DoraProjectSource;
  successCount: number;
  failedCount: number;
}

/** Response of `GET /api/dora/metrics` (GitLab source). */
export interface DoraMetricsResponse {
  scope: 'all' | 'project';
  projectId: number | null;
  period: DoraPeriod;
  periodStart: string;
  periodEnd: string;
  deploymentFrequency: { perDay: number | null; count: number; rating: DoraRating | null };
  leadTime: { medianSeconds: number | null; averageSeconds: number | null; samples: number; rating: DoraRating | null };
  mttr: { averageSeconds: number | null; recoveries: number; rating: DoraRating | null };
  changeFailureRate: { rate: number | null; failed: number; total: number; rating: DoraRating | null };
  projects: DoraProjectSummary[];
  truncated: boolean;
}

export interface TrendPoint {
  [key: string]: unknown;
  timestamp: string;
  value: number;
}

export interface TrendData {
  deploymentFrequency: TrendPoint[];
  leadTime: TrendPoint[];
  successRate: TrendPoint[];
}

const TREND_METRICS = 'deployment_frequency,lead_time,success_rate';

function formatDuration(seconds: number): { value: string; unit: string } {
  if (seconds < 3600) return { value: String(Math.max(1, Math.round(seconds / 60))), unit: 'min' };
  if (seconds < 48 * 3600) return { value: (seconds / 3600).toFixed(1), unit: 'hours' };
  return { value: (seconds / 86400).toFixed(1), unit: 'days' };
}

function formatFrequency(perDay: number): { value: string; unit: string } {
  if (perDay >= 1) return { value: perDay.toFixed(1), unit: 'per day' };
  if (perDay >= 1 / 7) return { value: (perDay * 7).toFixed(1), unit: 'per week' };
  return { value: (perDay * 30).toFixed(1), unit: 'per month' };
}

/** Turn the API response into display cards. Absent data stays null instead of becoming 0. */
export function toDoraMetrics(data: DoraMetricsResponse): DoraMetric[] {
  const { deploymentFrequency: df, leadTime: lt, mttr, changeFailureRate: cfr } = data;

  const frequency = df.perDay === null ? null : formatFrequency(df.perDay);
  const lead = lt.medianSeconds === null ? null : formatDuration(lt.medianSeconds);
  const recovery = mttr.averageSeconds === null ? null : formatDuration(mttr.averageSeconds);

  let mttrDetail: string | undefined;
  if (mttr.averageSeconds !== null) {
    mttrDetail = `${mttr.recoveries} recovered failure${mttr.recoveries === 1 ? '' : 's'}`;
  } else if (cfr.total > 0 && cfr.failed === 0) {
    mttrDetail = 'No failures in period';
  } else if (cfr.failed > 0) {
    mttrDetail = 'No recovery yet';
  }

  return [
    {
      name: 'Deployment Frequency',
      value: frequency?.value ?? null,
      unit: frequency?.unit ?? '',
      rating: df.rating,
      detail: df.perDay === null ? undefined : `${df.count} successful in period`,
      icon: 'activity',
    },
    {
      name: 'Lead Time for Changes',
      value: lead?.value ?? null,
      unit: lead?.unit ?? '',
      rating: lt.rating,
      detail: lt.samples > 0 ? `Median of ${lt.samples}` : undefined,
      icon: 'clock',
    },
    {
      name: 'Mean Time to Recovery',
      value: recovery?.value ?? null,
      unit: recovery?.unit ?? '',
      rating: mttr.rating,
      detail: mttrDetail,
      icon: 'alert',
    },
    {
      name: 'Change Failure Rate',
      value: cfr.rate === null ? null : cfr.rate.toFixed(1),
      unit: cfr.rate === null ? '' : '%',
      rating: cfr.rating,
      detail: cfr.total > 0 ? `${cfr.failed} of ${cfr.total} failed` : undefined,
      icon: 'target',
    },
  ];
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof message === 'string' && message) return message;
  }
  return 'Failed to load analytics data';
}

export function useDoraMetrics(projectId?: number, period: DoraPeriod = '30d') {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DoraMetric[]>([]);
  const [summary, setSummary] = useState<DoraMetricsResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ period });
      if (projectId) params.append('projectId', projectId.toString());

      try {
        // Sequential on purpose: the trends request then reuses the report the server just cached.
        const metricsResponse = await axios.get(`/api/dora/metrics?${params}`);
        const trendResponse = await axios.get(`/api/trends?${params}&metrics=${TREND_METRICS}`);
        if (cancelled) return;

        const data = metricsResponse.data?.data as DoraMetricsResponse | undefined;
        setSummary(data ?? null);
        setMetrics(data ? toDoraMetrics(data) : []);

        const trends = trendResponse.data?.data ?? {};
        setTrendData({
          deploymentFrequency: trends.deployment_frequency?.data ?? [],
          leadTime: trends.lead_time?.data ?? [],
          successRate: trends.success_rate?.data ?? [],
        });
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        setSummary(null);
        setMetrics([]);
        setTrendData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetrics();
    return () => {
      cancelled = true;
    };
  }, [projectId, period]);

  const hasData = metrics.some((m) => m.value !== null);

  return { loading, error, metrics, summary, trendData, hasData };
}
