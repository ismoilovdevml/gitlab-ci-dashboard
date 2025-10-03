import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';

// GET /api/channels - Get all alert channels
export async function GET() {
  try {
    const channels = await cacheHelpers.getOrSet(
      'alert:channels',
      async () => {
        return await prisma.alertChannel.findMany({
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
    const body = await request.json();
    const { type, enabled, config } = body;

    if (!type || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: type, config' },
        { status: 400 }
      );
    }

    // Check if channel exists
    const existing = await prisma.alertChannel.findFirst({
      where: { type },
    });

    let channel;
    if (existing) {
      // Update existing channel
      channel = await prisma.alertChannel.update({
        where: { id: existing.id },
        data: { enabled, config, updatedAt: new Date() },
      });
    } else {
      // Create new channel
      channel = await prisma.alertChannel.create({
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
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Missing channel type' },
        { status: 400 }
      );
    }

    // Find channel by type first
    const channel = await prisma.alertChannel.findFirst({
      where: { type },
    });

    if (channel) {
      await prisma.alertChannel.delete({
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
