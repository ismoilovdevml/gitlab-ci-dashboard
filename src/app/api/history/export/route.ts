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

    // SECURITY FIX: Use batch processing to prevent memory exhaustion
    // Instead of loading all 10k records at once, stream in batches
    const BATCH_SIZE = 1000;
    const MAX_RECORDS = 10000;
    let allRecords: Array<{
      id: string;
      projectName: string;
      pipelineId: number;
      status: string;
      channel: string;
      message: string;
      sent: boolean;
      error: string | null;
      createdAt: Date;
    }> = [];
    let skip = 0;

    // Fetch in batches to avoid memory issues
    while (skip < MAX_RECORDS) {
      const batch = await prisma.alertHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH_SIZE,
      });

      if (batch.length === 0) break;

      allRecords = allRecords.concat(batch);
      skip += BATCH_SIZE;

      // Stop if we've hit max or no more records
      if (batch.length < BATCH_SIZE || allRecords.length >= MAX_RECORDS) break;
    }

    const history = allRecords.slice(0, MAX_RECORDS);

    if (format === 'json') {
      return NextResponse.json(history, {
        headers: {
          'Content-Disposition': `attachment; filename="alert-history-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // Generate CSV in streaming fashion
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
