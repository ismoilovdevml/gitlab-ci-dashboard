import { NextRequest, NextResponse } from 'next/server';
import { getTrendAnalysis, getMultipleTrends } from '@/lib/trend-analysis';
import { logger } from '@/lib/logger';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

export async function GET(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const metric = searchParams.get('metric');
    const metrics = searchParams.get('metrics');
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    if (metrics) {
      // Multiple metrics
      const metricList = metrics.split(',');
      const trends = await getMultipleTrends(
        db,
        metricList,
        projectId ? parseInt(projectId, 10) : undefined,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );

      return NextResponse.json({
        success: true,
        data: trends,
      });
    }

    if (metric) {
      // Single metric
      const trend = await getTrendAnalysis(
        db,
        metric,
        projectId ? parseInt(projectId, 10) : undefined,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
        limit
      );

      return NextResponse.json({
        success: true,
        data: trend,
      });
    }

    return NextResponse.json(
      { error: 'metric or metrics parameter required' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Failed to fetch trend analysis', { error });
    return NextResponse.json(
      { error: 'Failed to fetch trend analysis' },
      { status: 500 }
    );
  }
}
