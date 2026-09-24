import { NextRequest, NextResponse } from 'next/server';
import { getTrendAnalysis, getMultipleTrends } from '@/lib/trend-analysis';
import {
  describeDoraError,
  getGitLabDoraReport,
  isDoraTrendMetric,
  searchParamsToObject,
  trendsQuerySchema,
} from '@/lib/dora-metrics';
import { getUserGitLabCredentials } from '@/lib/gitlab/credentials';
import { logger } from '@/lib/logger';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const QUERY_KEYS = ['metric', 'metrics', 'period', 'projectId', 'startDate', 'endDate', 'limit'] as const;

/**
 * GET /api/trends?metrics=a,b[&period=30d][&projectId=N]  → `{ data: { a: Trend, b: Trend } }`
 * GET /api/trends?metric=a[...]                           → `{ data: Trend }`
 *
 * `deployment_frequency`, `lead_time` and `success_rate` are computed from GitLab for the period
 * (see /api/dora/metrics); other metric names read recorded trend data between startDate and endDate.
 */
export async function GET(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = trendsQuerySchema.safeParse(searchParamsToObject(request.nextUrl.searchParams, QUERY_KEYS));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.issues },
        { status: 400 }
      );
    }
    const query = parsed.data;
    const requested = query.metrics ?? [query.metric as string];
    const fromGitLab = requested.filter(isDoraTrendMetric);
    const recorded = requested.filter((m) => !isDoraTrendMetric(m));
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const trends: Record<string, unknown> = {};

    if (fromGitLab.length > 0) {
      const scope = query.projectId !== undefined ? 'project' : 'all';
      try {
        const report = await getGitLabDoraReport({
          credentials: getUserGitLabCredentials(auth.user),
          organizationId: auth.organizationId,
          userId: auth.user.id,
          period: query.period,
          projectId: query.projectId,
        });
        for (const metric of fromGitLab) trends[metric] = report.trends[metric];
      } catch (error) {
        const described = describeDoraError(error, scope);
        if (!described) throw error;
        if (described.status >= 500) {
          logger.warn('DORA trends unavailable', { code: described.code, projectId: query.projectId });
        }
        return NextResponse.json(
          { error: described.message, code: described.code },
          { status: described.status, headers: NO_STORE }
        );
      }
    }

    if (query.metrics === undefined && recorded.length === 1) {
      const trend = await getTrendAnalysis(db, recorded[0], query.projectId, startDate, endDate, query.limit);
      return NextResponse.json({ success: true, data: trend }, { headers: NO_STORE });
    }

    if (recorded.length > 0) {
      Object.assign(trends, await getMultipleTrends(db, recorded, query.projectId, startDate, endDate));
    }

    const data = query.metrics === undefined ? trends[requested[0]] : trends;
    return NextResponse.json({ success: true, data }, { headers: NO_STORE });
  } catch (error) {
    logger.error('Failed to fetch trend analysis', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch trend analysis' }, { status: 500 });
  }
}
