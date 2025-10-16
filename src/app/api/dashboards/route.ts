import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// Get user from session (simplified - you should use proper auth)
function getUserIdFromRequest(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get('gitlab_dashboard_session');
  // In production, decode and verify session token
  // For now, return a mock user ID
  return sessionCookie ? 'mock-user-id' : null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dashboardId = searchParams.get('id');

    if (dashboardId) {
      const dashboard = await prisma.dashboard.findUnique({
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

    // Get all user dashboards
    const dashboards = await prisma.dashboard.findMany({
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
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      await prisma.dashboard.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.create({
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
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, layout, widgets, filters, isDefault, isPublic } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Dashboard ID required' },
        { status: 400 }
      );
    }

    const existing = await prisma.dashboard.findUnique({
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
      await prisma.dashboard.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.update({
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
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Dashboard ID required' },
        { status: 400 }
      );
    }

    const existing = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    await prisma.dashboard.delete({
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
