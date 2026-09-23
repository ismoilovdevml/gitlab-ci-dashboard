import { NextRequest, NextResponse } from 'next/server';
import { createIncident, resolveIncident } from '@/lib/dora-metrics';
import { logger } from '@/lib/logger';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

export async function POST(request: NextRequest) {
  try {
    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      projectName,
      title,
      severity,
      affectedEnv,
      detectedAt,
      createdBy,
    } = body;

    if (!projectId || !projectName || !title || !severity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const incidentId = await createIncident(
      projectId,
      projectName,
      title,
      severity,
      affectedEnv || 'production',
      detectedAt ? new Date(detectedAt) : new Date(),
      createdBy
    );

    return NextResponse.json({
      success: true,
      incidentId,
    });
  } catch (error) {
    logger.error('Failed to create incident', { error });
    return NextResponse.json(
      { error: 'Failed to create incident' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { incidentId, rootCause } = body;

    if (!incidentId) {
      return NextResponse.json(
        { error: 'Missing incidentId' },
        { status: 400 }
      );
    }

    await resolveIncident(incidentId, rootCause);

    return NextResponse.json({
      success: true,
      message: 'Incident resolved',
    });
  } catch (error) {
    logger.error('Failed to resolve incident', { error });
    return NextResponse.json(
      { error: 'Failed to resolve incident' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const incidents = await db.incident.findMany({
      where: {
        ...(projectId && { projectId: parseInt(projectId, 10) }),
        ...(status && { status }),
      },
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: incidents,
    });
  } catch (error) {
    logger.error('Failed to fetch incidents', { error });
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
}
