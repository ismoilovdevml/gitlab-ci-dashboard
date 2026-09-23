import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { redis, cacheHelpers } from '@/lib/db/redis';

const HISTORY_CACHE_PREFIX = 'history:';
const CACHE_TTL = 60; // 1 minute

// History is per organization, so every cache key carries the org id.
function orgCachePrefix(organizationId: string | null): string {
  return `${HISTORY_CACHE_PREFIX}${organizationId ?? 'default'}:`;
}

// GET /api/history?limit=50&cursor=abc123&search=project&status=success&channel=telegram&startDate=2024-01-01&endDate=2024-12-31
// Supports cursor-based pagination, search, and filters
export async function GET(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // SECURITY FIX: Limit to max 100 records per request with radix and NaN validation
    const parsedLimit = parseInt(limitParam || '50', 10);
    const limit = Math.min(Math.max(isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100);

    // Build cache key from query params
    const cacheKey = `${orgCachePrefix(auth.organizationId)}${search || ''}_${status || ''}_${channel || ''}_${startDate || ''}_${endDate || ''}_${cursor || ''}_${limit}`;

    // Try to get from cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      console.warn('Cache read failed:', cacheError);
    }

    // Build where clause for filters
    const where: {
      projectName?: { contains: string; mode: 'insensitive' };
      message?: { contains: string; mode: 'insensitive' };
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
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          where.createdAt.gte = parsedStartDate;
        }
      }
      if (endDate) {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          where.createdAt.lte = parsedEndDate;
        }
      }
    }

    const history = await db.alertHistory.findMany({
      take: limit + 1, // Take one extra to check if there are more results
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor item
      }),
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Check if there are more results
    const hasMore = history.length > limit;
    const data = hasMore ? history.slice(0, -1) : history;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const response = {
      data,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    };

    // Cache the response
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));
    } catch (cacheError) {
      console.warn('Cache write failed:', cacheError);
    }

    return NextResponse.json(response);
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
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectName, pipelineId, status, channel, message, sent, error } = body;

    if (!projectName || !pipelineId || !status || !channel || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const entry = await db.alertHistory.create({
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

    // Clear cache on new entry using SCAN (non-blocking)
    try {
      await cacheHelpers.invalidate(`${orgCachePrefix(auth.organizationId)}*`);
    } catch (cacheError) {
      console.warn('Cache clear failed:', cacheError);
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Failed to create history entry:', error);
    return NextResponse.json(
      { error: 'Failed to create history entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/history?id=xyz - Delete single entry or clear all
export async function DELETE(request: NextRequest) {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // Delete single entry
      await db.alertHistory.delete({
        where: { id },
      });
    } else {
      // Clear all history
      await db.alertHistory.deleteMany();
    }

    // Clear cache using SCAN (non-blocking)
    try {
      await cacheHelpers.invalidate(`${orgCachePrefix(auth.organizationId)}*`);
    } catch (cacheError) {
      console.warn('Cache clear failed:', cacheError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete history:', error);
    return NextResponse.json(
      { error: 'Failed to delete history' },
      { status: 500 }
    );
  }
}
