import { NextRequest, NextResponse } from 'next/server';
import {
  calculateDoraMetrics,
  describeDoraError,
  doraMetricsQuerySchema,
  getDoraMetricsSummary,
  getGitLabDoraReport,
  searchParamsToObject,
} from '@/lib/dora-metrics';
import { getUserGitLabCredentials } from '@/lib/gitlab/credentials';
import { logger } from '@/lib/logger';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

type OrgPrisma = Awaited<ReturnType<typeof getOrgPrisma>>;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Metrics from manually recorded deployments and incidents (`/api/dora/deployments`,
 * `/api/dora/incidents`), selected with `source=records`.
 */
async function recordedMetrics(request: NextRequest, db: OrgPrisma['db']): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const projectIds = searchParams.get('projectIds');
  const period = searchParams.get('period') || 'monthly';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (projectIds) {
    const ids = projectIds.split(',').map((id) => parseInt(id, 10)).filter((id) => Number.isSafeInteger(id) && id > 0);
    const metrics = await getDoraMetricsSummary(db, ids, period);
    return NextResponse.json({ success: true, data: metrics });
  }

  const id = projectId ? parseInt(projectId, 10) : NaN;
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!Number.isSafeInteger(id) || id <= 0 || !start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'source=records requires projectIds, or projectId with startDate and endDate' },
      { status: 400 }
    );
  }

  const metrics = await calculateDoraMetrics(db, id, `Project ${id}`, start, end, period);
  return NextResponse.json({ success: true, data: metrics });
}

/**
 * GET /api/dora/metrics?period=7d|30d|90d[&projectId=N]
 *
 * DORA metrics computed from the caller's GitLab data: one project, or all of the caller's
 * recently active projects. Values are null when the period has nothing to measure.
 */
export async function GET(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (request.nextUrl.searchParams.get('source') === 'records') {
      return await recordedMetrics(request, db);
    }

    const parsed = doraMetricsQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams, ['period', 'projectId'])
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.issues },
        { status: 400 }
      );
    }
    const { period, projectId } = parsed.data;
    const scope = projectId !== undefined ? 'project' : 'all';

    try {
      const credentials = getUserGitLabCredentials(auth.user);
      const report = await getGitLabDoraReport({
        credentials,
        organizationId: auth.organizationId,
        userId: auth.user.id,
        period,
        projectId,
      });
      return NextResponse.json({ success: true, data: report.metrics }, { headers: NO_STORE });
    } catch (error) {
      const described = describeDoraError(error, scope);
      if (!described) throw error;
      if (described.status >= 500) {
        logger.warn('DORA metrics unavailable', { code: described.code, projectId });
      }
      return NextResponse.json(
        { error: described.message, code: described.code },
        { status: described.status, headers: NO_STORE }
      );
    }
  } catch (error) {
    logger.error('Failed to fetch DORA metrics', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
