import prisma from './db/prisma';
import { logger } from './logger';

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
  projectId: number,
  projectName: string,
  startDate: Date,
  endDate: Date,
  period: string = 'monthly'
): Promise<DoraMetrics> {
  try {
    // Calculate deployment frequency
    const deployments = await prisma.deployment.findMany({
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
    const incidents = await prisma.incident.findMany({
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
    await prisma.doraMetric.upsert({
      where: {
        projectId_period_periodStart: {
          projectId,
          period,
          periodStart: startDate,
        },
      },
      create: {
        projectId,
        projectName,
        period,
        periodStart: startDate,
        periodEnd: endDate,
        deploymentCount: deployments.length,
        deploymentFreq: deploymentsPerDay,
        avgLeadTime: Math.round(avgLeadTime),
        medianLeadTime: Math.round(medianLeadTime),
        incidentCount: incidents.length,
        avgMttr: Math.round(avgMttr),
        failedDeployments: failedDeployments.length,
        failureRate: changeFailureRate,
      },
      update: {
        deploymentCount: deployments.length,
        deploymentFreq: deploymentsPerDay,
        avgLeadTime: Math.round(avgLeadTime),
        medianLeadTime: Math.round(medianLeadTime),
        incidentCount: incidents.length,
        avgMttr: Math.round(avgMttr),
        failedDeployments: failedDeployments.length,
        failureRate: changeFailureRate,
        calculatedAt: new Date(),
      },
    });

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

    await prisma.deployment.create({
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
  projectId: number,
  projectName: string,
  title: string,
  severity: string,
  affectedEnv: string,
  detectedAt: Date,
  createdBy: string | null
): Promise<string> {
  try {
    const incident = await prisma.incident.create({
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
  incidentId: string,
  rootCause?: string
): Promise<void> {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    const resolvedAt = new Date();
    const duration = Math.round(
      (resolvedAt.getTime() - incident.detectedAt.getTime()) / 1000
    );

    await prisma.incident.update({
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
  projectIds: number[],
  period: string = 'monthly'
): Promise<DoraMetrics[]> {
  const metrics: DoraMetrics[] = [];

  for (const projectId of projectIds) {
    const latestMetric = await prisma.doraMetric.findFirst({
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
