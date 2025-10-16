import prisma from './db/prisma';
import { logger } from './logger';
import { Prisma } from '@prisma/client';

export interface TrendPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface TrendAnalysis {
  metric: string;
  projectId?: number;
  data: TrendPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
  prediction?: number;
}

/**
 * Record trend data point
 */
export async function recordTrendData(
  metric: string,
  value: number,
  projectId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.trendData.create({
      data: {
        metric,
        projectId,
        value,
        timestamp: new Date(),
        metadata: (metadata as Prisma.InputJsonValue) || Prisma.JsonNull,
      },
    });
  } catch (error) {
    logger.error('Failed to record trend data', { metric, error });
  }
}

/**
 * Calculate trend direction
 */
function calculateTrend(
  values: number[]
): 'increasing' | 'decreasing' | 'stable' {
  if (values.length < 2) return 'stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg =
    firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

  const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (Math.abs(changePercent) < 5) return 'stable';
  return changePercent > 0 ? 'increasing' : 'decreasing';
}

/**
 * Simple linear regression for prediction
 */
function predictNextValue(values: number[]): number {
  if (values.length < 2) return values[0] || 0;

  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);

  const sumX = xValues.reduce((sum, x) => sum + x, 0);
  const sumY = values.reduce((sum, y) => sum + y, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Predict next value
  return slope * n + intercept;
}

/**
 * Get trend analysis for a metric
 */
export async function getTrendAnalysis(
  metric: string,
  projectId?: number,
  startDate?: Date,
  endDate?: Date,
  limit: number = 100
): Promise<TrendAnalysis> {
  try {
    const data = await prisma.trendData.findMany({
      where: {
        metric,
        ...(projectId && { projectId }),
        ...(startDate && endDate && {
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    const points: TrendPoint[] = data.map((d): TrendPoint => ({
      timestamp: d.timestamp,
      value: d.value,
      metadata: d.metadata as Record<string, unknown>,
    }));

    const values = points.map((p) => p.value);
    const trend = calculateTrend(values);

    // Calculate change percent (first vs last)
    const changePercent =
      values.length >= 2
        ? ((values[values.length - 1] - values[0]) / values[0]) * 100
        : 0;

    const prediction = predictNextValue(values);

    return {
      metric,
      projectId,
      data: points,
      trend,
      changePercent,
      prediction,
    };
  } catch (error) {
    logger.error('Failed to get trend analysis', { metric, error });
    throw error;
  }
}

/**
 * Get multiple trends
 */
export async function getMultipleTrends(
  metrics: string[],
  projectId?: number,
  startDate?: Date,
  endDate?: Date
): Promise<TrendAnalysis[]> {
  const trends: TrendAnalysis[] = [];

  for (const metric of metrics) {
    try {
      const trend = await getTrendAnalysis(
        metric,
        projectId,
        startDate,
        endDate
      );
      trends.push(trend);
    } catch (error) {
      logger.error('Failed to get trend', { metric, error });
    }
  }

  return trends;
}

/**
 * Auto-record pipeline metrics
 */
export async function recordPipelineMetrics(
  projectId: number,
  pipelineId: number,
  status: string,
  duration: number
): Promise<void> {
  // Record success rate
  await recordTrendData(
    'pipeline_success_rate',
    status === 'success' ? 100 : 0,
    projectId,
    { pipelineId, status }
  );

  // Record duration
  if (duration > 0) {
    await recordTrendData('pipeline_duration', duration, projectId, {
      pipelineId,
      status,
    });
  }

  // Record count
  await recordTrendData('pipeline_count', 1, projectId, {
    pipelineId,
    status,
  });
}

/**
 * Calculate moving average
 */
export function calculateMovingAverage(
  data: TrendPoint[],
  window: number = 7
): TrendPoint[] {
  if (data.length < window) return data;

  const result: TrendPoint[] = [];

  for (let i = window - 1; i < data.length; i++) {
    const windowData = data.slice(i - window + 1, i + 1);
    const avg =
      windowData.reduce((sum, point) => sum + point.value, 0) / window;

    result.push({
      timestamp: data[i].timestamp,
      value: avg,
      metadata: { original: data[i].value } as Record<string, unknown>,
    });
  }

  return result;
}
