import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'csv';

    // Build where clause for filters
    const where: {
      projectName?: { contains: string; mode: 'insensitive' };
      status?: string;
      channel?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};

    if (search) {
      where.projectName = { contains: search, mode: 'insensitive' };
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (channel && channel !== 'all') {
      where.channel = channel;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const history = await prisma.alertHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit export to 10k records
    });

    if (format === 'json') {
      return NextResponse.json(history, {
        headers: {
          'Content-Disposition': `attachment; filename="alert-history-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // Generate CSV
    const csvHeaders = ['Date', 'Project', 'Pipeline ID', 'Status', 'Channel', 'Message', 'Sent', 'Error'];
    const csvRows = history.map(h => [
      h.createdAt.toISOString(),
      h.projectName,
      h.pipelineId.toString(),
      h.status,
      h.channel,
      `"${h.message.replace(/"/g, '""')}"`, // Escape quotes
      h.sent ? 'Yes' : 'No',
      h.error ? `"${h.error.replace(/"/g, '""')}"` : '',
    ]);

    const csv = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="alert-history-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export history:', error);
    return NextResponse.json(
      { error: 'Failed to export history' },
      { status: 500 }
    );
  }
}
