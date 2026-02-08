import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/license';
import { logger } from '@/lib/logger';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';

export async function GET(request: NextRequest) {
  try {
    const featureCheck = await requireFeature('custom_dashboard');
    if (featureCheck) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 });
    }
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const dashboardId = searchParams.get('id');

    if (dashboardId) {
      const dashboard = await db.dashboard.findUnique({
        where: { id: dashboardId },
      });

      if (!dashboard) {
        return NextResponse.json(
          { error: 'Dashboard not found' },
          { status: 404 }
        );
      }

      if (dashboard.userId !== userId && !dashboard.isPublic) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        data: dashboard,
      });
    }

    // Get all user dashboards (org-scoped automatically)
    const dashboards = await db.dashboard.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      data: dashboards,
    });
  } catch (error) {
    logger.error('Failed to fetch dashboards', { error });
    return NextResponse.json(
      { error: 'Failed to fetch dashboards' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const featureCheck = await requireFeature('custom_dashboard');
    if (featureCheck) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 });
    }
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { name, description, layout, widgets, filters, isDefault, isPublic } = body;

    if (!name || !layout || !widgets) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.dashboard.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await db.dashboard.create({
      data: {
        userId,
        name,
        description,
        layout,
        widgets,
        filters: filters || {},
        isDefault: isDefault || false,
        isPublic: isPublic || false,
      },
    });

    return NextResponse.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to create dashboard', { error });
    return NextResponse.json(
      { error: 'Failed to create dashboard' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const featureCheck = await requireFeature('custom_dashboard');
    if (featureCheck) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 });
    }
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { id, name, description, layout, widgets, filters, isDefault, isPublic } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Dashboard ID required' },
        { status: 400 }
      );
    }

    const existing = await db.dashboard.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await db.dashboard.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const dashboard = await db.dashboard.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(layout && { layout }),
        ...(widgets && { widgets }),
        ...(filters !== undefined && { filters }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isPublic !== undefined && { isPublic }),
      },
    });

    return NextResponse.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to update dashboard', { error });
    return NextResponse.json(
      { error: 'Failed to update dashboard' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const featureCheck = await requireFeature('custom_dashboard');
    if (featureCheck) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 });
    }
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Dashboard ID required' },
        { status: 400 }
      );
    }

    const existing = await db.dashboard.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    await db.dashboard.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard deleted',
    });
  } catch (error) {
    logger.error('Failed to delete dashboard', { error });
    return NextResponse.json(
      { error: 'Failed to delete dashboard' },
      { status: 500 }
    );
  }
}
