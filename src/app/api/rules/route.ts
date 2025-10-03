import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';

// GET /api/rules - Get all alert rules
export async function GET() {
  try {
    const rules = await cacheHelpers.getOrSet(
      'alert:rules',
      async () => {
        return await prisma.alertRule.findMany({
          orderBy: { createdAt: 'desc' },
        });
      },
      30 // Cache for 30 seconds
    );

    return NextResponse.json(rules);
  } catch (error) {
    console.error('Failed to fetch rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rules' },
      { status: 500 }
    );
  }
}

// POST /api/rules - Create new rule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, projectId, projectName, channels, events, enabled } = body;

    if (!name || !projectId || !projectName || !channels || !events) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const rule = await prisma.alertRule.create({
      data: {
        name,
        projectId: String(projectId),
        projectName,
        channels,
        events,
        enabled: enabled ?? true,
      },
    });

    // Invalidate cache
    await cacheHelpers.invalidate('alert:rules');

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Failed to create rule:', error);
    return NextResponse.json(
      { error: 'Failed to create rule' },
      { status: 500 }
    );
  }
}

// PUT /api/rules - Update rule
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing rule ID' },
        { status: 400 }
      );
    }

    const rule = await prisma.alertRule.update({
      where: { id },
      data: {
        ...data,
        projectId: data.projectId ? String(data.projectId) : undefined,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    await cacheHelpers.invalidate('alert:rules');

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Failed to update rule:', error);
    return NextResponse.json(
      { error: 'Failed to update rule' },
      { status: 500 }
    );
  }
}

// DELETE /api/rules?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing rule ID' },
        { status: 400 }
      );
    }

    await prisma.alertRule.delete({
      where: { id },
    });

    // Invalidate cache
    await cacheHelpers.invalidate('alert:rules');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
