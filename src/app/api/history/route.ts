import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

// GET /api/history?limit=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const history = await prisma.alertHistory.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(history);
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
