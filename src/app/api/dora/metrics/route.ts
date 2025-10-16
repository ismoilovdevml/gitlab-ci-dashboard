import { NextRequest, NextResponse } from 'next/server';
import { calculateDoraMetrics, getDoraMetricsSummary } from '@/lib/dora-metrics';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const projectIds = searchParams.get('projectIds');
    const period = searchParams.get('period') || 'monthly';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Multiple projects summary
    if (projectIds) {
      const ids = projectIds.split(',').map(id => parseInt(id, 10));
      const metrics = await getDoraMetricsSummary(ids, period);

      return NextResponse.json({
        success: true,
        data: metrics,
      });
    }

    // Single project metrics or all projects
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (projectId) {
        // Single project
        const id = parseInt(projectId, 10);
        const projectName = `Project ${id}`;

        const metrics = await calculateDoraMetrics(
          id,
          projectName,
          start,
          end,
          period
        );

        return NextResponse.json({
          success: true,
          data: metrics,
        });
      } else {
        // All projects - return mock data for now
        return NextResponse.json({
          success: true,
          data: {
            deploymentFrequency: { value: 0, rating: 'low' },
            leadTime: { median: 0, rating: 'low' },
            mttr: { avg: 0, rating: 'low' },
            changeFailureRate: { rate: 0, rating: 'elite' },
          },
        });
      }
    }

    return NextResponse.json(
      { error: 'Missing required parameters: startDate and endDate are required' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Failed to fetch DORA metrics', { error });
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
