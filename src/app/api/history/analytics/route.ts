import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { redis } from '@/lib/db/redis';

const ANALYTICS_CACHE_KEY = 'history:analytics';
const CACHE_TTL = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    // Try to get from cache
    try {
      const cached = await redis.get(`${ANALYTICS_CACHE_KEY}:${days}`);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      console.warn('Cache read failed:', cacheError);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all history records within date range
    const history = await prisma.alertHistory.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate statistics
    const totalAlerts = history.length;
    const successfulAlerts = history.filter(h => h.sent).length;
    const failedAlerts = history.filter(h => !h.sent).length;
    const successRate = totalAlerts > 0 ? (successfulAlerts / totalAlerts) * 100 : 0;

    // Group by channel
    const channelStats = history.reduce((acc, h) => {
      if (!acc[h.channel]) {
        acc[h.channel] = { total: 0, success: 0, failed: 0 };
      }
      acc[h.channel].total++;
      if (h.sent) {
        acc[h.channel].success++;
      } else {
        acc[h.channel].failed++;
      }
      return acc;
    }, {} as Record<string, { total: number; success: number; failed: number }>);

    // Group by status
    const statusStats = history.reduce((acc, h) => {
      if (!acc[h.status]) {
        acc[h.status] = 0;
      }
      acc[h.status]++;
      return acc;
    }, {} as Record<string, number>);

    // Group by project
    const projectStats = history.reduce((acc, h) => {
      if (!acc[h.projectName]) {
        acc[h.projectName] = { total: 0, success: 0, failed: 0 };
      }
      acc[h.projectName].total++;
      if (h.sent) {
        acc[h.projectName].success++;
      } else {
        acc[h.projectName].failed++;
      }
      return acc;
    }, {} as Record<string, { total: number; success: number; failed: number }>);

    // Get top 5 projects by alert count
    const topProjects = Object.entries(projectStats)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));

    // Time series data (daily)
    const timeSeriesData: Record<string, { date: string; total: number; success: number; failed: number }> = {};

    history.forEach(h => {
      const date = h.createdAt.toISOString().split('T')[0];
      if (!timeSeriesData[date]) {
        timeSeriesData[date] = { date, total: 0, success: 0, failed: 0 };
      }
      timeSeriesData[date].total++;
      if (h.sent) {
        timeSeriesData[date].success++;
      } else {
        timeSeriesData[date].failed++;
      }
    });

    const timeSeries = Object.values(timeSeriesData).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const analytics = {
      summary: {
        totalAlerts,
        successfulAlerts,
        failedAlerts,
        successRate: Math.round(successRate * 100) / 100,
      },
      channelStats,
      statusStats,
      projectStats: topProjects,
      timeSeries,
    };

    // Cache the response
    try {
      await redis.setex(`${ANALYTICS_CACHE_KEY}:${days}`, CACHE_TTL, JSON.stringify(analytics));
    } catch (cacheError) {
      console.warn('Cache write failed:', cacheError);
    }

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
