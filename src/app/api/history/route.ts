import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

// GET /api/history?limit=50&cursor=abc123
// Supports cursor-based pagination for better performance
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor');

    // Limit to max 100 records per request
    const limit = Math.min(parseInt(limitParam || '50'), 100);

    const history = await prisma.alertHistory.findMany({
      take: limit + 1, // Take one extra to check if there are more results
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor item
      }),
      orderBy: { createdAt: 'desc' },
    });

    // Check if there are more results
    const hasMore = history.length > limit;
    const data = hasMore ? history.slice(0, -1) : history;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return NextResponse.json({
      data,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    });
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

// POST /api/history - Add history entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, pipelineId, status, channel, message, sent, error } = body;

    if (!projectName || !pipelineId || !status || !channel || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const entry = await prisma.alertHistory.create({
      data: {
        projectName,
        pipelineId,
        status,
        channel,
        message,
        sent: sent ?? false,
        error,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Failed to create history entry:', error);
    return NextResponse.json(
      { error: 'Failed to create history entry' },
      { status: 500 }
    );
  }
}
