import { NextResponse } from 'next/server';
import { redis } from '@/lib/db/redis';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';

const INSIGHTS_CACHE_KEY = 'insights:data';
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    // Try cache first
    const cached = await redis.get(INSIGHTS_CACHE_KEY);
    if (cached) {
      return NextResponse.json({ cached: true, data: JSON.parse(cached) });
    }

    const api = await getGitLabAPIAsync();

    const [summaryData, failuresData, flakyData, bottlenecksData, deploymentsData] =
      await Promise.all([
        api.getInsightsSummary(7),
        api.getFailureAnalysis(7),
        api.getFlakyTests(7),
        api.getPerformanceBottlenecks(7),
        api.getDeploymentFrequency(7),
      ]);

    const insightsData = {
      summary: summaryData,
      failures: failuresData,
      flakyTests: flakyData,
      bottlenecks: bottlenecksData,
      deployments: deploymentsData,
    };

    // Cache it
    await redis.setex(INSIGHTS_CACHE_KEY, CACHE_TTL, JSON.stringify(insightsData));

    return NextResponse.json({ cached: false, data: insightsData });
  } catch (error) {
    console.error('Insights API error:', error);
    return NextResponse.json(
      { error: 'Failed to load insights' },
      { status: 500 }
    );
  }
}
