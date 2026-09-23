import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { cacheHelpers } from '@/lib/db/redis';

// GET /api/channels - Get all alert channels
export async function GET() {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const channels = await cacheHelpers.getOrSet(
      'alert:channels',
      async () => {
        return await db.alertChannel.findMany({
          orderBy: { updatedAt: 'desc' },
        });
      },
      60 // Cache for 60 seconds
    );

    return NextResponse.json(channels);
  } catch (error) {
    console.error('Failed to fetch channels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    );
  }
}

// POST /api/channels - Create or update channel
export async function POST(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, enabled, config } = body;

    if (!type || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: type, config' },
        { status: 400 }
      );
    }

    // Check if channel exists
    const existing = await db.alertChannel.findFirst({
      where: { type },
    });

    let channel;
    if (existing) {
      // Update existing channel
      channel = await db.alertChannel.update({
        where: { id: existing.id },
        data: { enabled, config, updatedAt: new Date() },
      });
    } else {
      // Create new channel
      channel = await db.alertChannel.create({
        data: { type, enabled: enabled ?? false, config },
      });
    }

    // Invalidate cache
    await cacheHelpers.invalidate('alert:channels');

    return NextResponse.json(channel);
  } catch (error) {
    console.error('Failed to save channel:', error);
    return NextResponse.json(
      { error: 'Failed to save channel' },
      { status: 500 }
    );
  }
}

// DELETE /api/channels?type=telegram
export async function DELETE(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Missing channel type' },
        { status: 400 }
      );
    }

    // Find channel by type first
    const channel = await db.alertChannel.findFirst({
      where: { type },
    });

    if (channel) {
      await db.alertChannel.delete({
        where: { id: channel.id },
      });
    }

    // Invalidate cache
    await cacheHelpers.invalidate('alert:channels');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete channel:', error);
    return NextResponse.json(
      { error: 'Failed to delete channel' },
      { status: 500 }
    );
  }
}
