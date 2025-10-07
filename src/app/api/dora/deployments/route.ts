import { NextRequest, NextResponse } from 'next/server';
import { trackDeployment } from '@/lib/dora-metrics';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      projectName,
      pipelineId,
      environment,
      status,
      startedAt,
      finishedAt,
      commitSha,
      ref,
      triggeredBy,
    } = body;

    if (!projectId || !projectName || !pipelineId || !environment || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await trackDeployment(
      projectId,
      projectName,
      pipelineId,
      environment,
      status,
      new Date(startedAt),
      finishedAt ? new Date(finishedAt) : null,
      commitSha,
      ref,
      triggeredBy
    );

    return NextResponse.json({
      success: true,
      message: 'Deployment tracked successfully',
    });
  } catch (error) {
    logger.error('Failed to track deployment', { error });
    return NextResponse.json(
      { error: 'Failed to track deployment' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const prisma = (await import('@/lib/db/prisma')).default;

    const deployments = await prisma.deployment.findMany({
      where: projectId ? { projectId: parseInt(projectId, 10) } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: deployments,
    });
  } catch (error) {
    logger.error('Failed to fetch deployments', { error });
    return NextResponse.json(
      { error: 'Failed to fetch deployments' },
      { status: 500 }
    );
  }
}
