import { redis } from './db/redis';
import { Runner } from './gitlab-api';

const ANALYTICS_CACHE_KEY = 'analytics:dashboard';
const CACHE_TTL = 300; // 5 minutes

interface TimeSeriesDataItem {
  date: string;
  success: number;
  failed: number;
  total: number;
  avgDuration: number;
}

interface ProjectActivityItem {
  project: {
    id: number;
    name: string;
  };
  pipelineCount: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
}

export interface AnalyticsCacheData {
  timeSeriesData: TimeSeriesDataItem[];
  activeProjects: ProjectActivityItem[];
  runners: Runner[];
  successRate: number;
  avgDuration: number;
  runnerUtilization: number;
  activeRunners: number;
  totalRunners: number;
  timestamp: number;
}

export async function getCachedAnalytics(): Promise<AnalyticsCacheData | null> {
  try {
    const cached = await redis.get(ANALYTICS_CACHE_KEY);
    if (!cached) return null;

    const data: AnalyticsCacheData = JSON.parse(cached);

    // Check if cache is still valid (less than 5 minutes old)
    const now = Date.now();
    const age = now - data.timestamp;
    if (age > CACHE_TTL * 1000) {
      await redis.del(ANALYTICS_CACHE_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get cached analytics:', error);
    return null;
  }
}

export async function setCachedAnalytics(data: Omit<AnalyticsCacheData, 'timestamp'>): Promise<void> {
  try {
    const cacheData: AnalyticsCacheData = {
      ...data,
      timestamp: Date.now(),
    };

    await redis.setex(
      ANALYTICS_CACHE_KEY,
      CACHE_TTL,
      JSON.stringify(cacheData)
    );
  } catch (error) {
    console.error('Failed to cache analytics:', error);
  }
}

export async function clearAnalyticsCache(): Promise<void> {
  try {
    await redis.del(ANALYTICS_CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear analytics cache:', error);
  }
}
