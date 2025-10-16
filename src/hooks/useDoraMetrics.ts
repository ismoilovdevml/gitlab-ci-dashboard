import { useState, useEffect } from 'react';
import axios from 'axios';

export interface DoraMetric {
  name: string;
  value: string;
  unit: string;
  rating: 'elite' | 'high' | 'medium' | 'low';
  trend: 'up' | 'down' | 'stable';
  icon: 'activity' | 'clock' | 'alert' | 'target';
}

export interface DoraMetricsData {
  deploymentFrequency: { value: number; rating: string };
  leadTime: { median: number; rating: string };
  mttr: { avg: number; rating: string };
  changeFailureRate: { rate: number; rating: string };
}

export interface TrendPoint {
  [key: string]: unknown;
  timestamp: Date;
  value: number;
}

export interface TrendData {
  deploymentFrequency: TrendPoint[];
  leadTime: TrendPoint[];
  successRate: TrendPoint[];
}

export function useDoraMetrics(projectId?: number, period: string = '30d') {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DoraMetric[]>([]);
  const [trendData, setTrendData] = useState<TrendData | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Calculate date range based on period
        const endDate = new Date();
        const startDate = new Date();

        switch (period) {
          case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
          default:
            startDate.setDate(endDate.getDate() - 30);
        }

        // Fetch DORA metrics
        const metricsParams = new URLSearchParams({
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });

        if (projectId) {
          metricsParams.append('projectId', projectId.toString());
        }

        const metricsResponse = await axios.get(`/api/dora/metrics?${metricsParams}`);

        if (metricsResponse.data.success && metricsResponse.data.data) {
          const data: DoraMetricsData = metricsResponse.data.data;

          // Transform API data to DoraMetric format
          const transformedMetrics: DoraMetric[] = [
            {
              name: 'Deployment Frequency',
              value: data.deploymentFrequency.value.toFixed(1),
              unit: 'per day',
              rating: data.deploymentFrequency.rating as DoraMetric['rating'],
              trend: 'stable' as const,
              icon: 'activity' as const,
            },
            {
              name: 'Lead Time for Changes',
              value: (data.leadTime.median / 3600).toFixed(1), // Convert seconds to hours
              unit: 'hours',
              rating: data.leadTime.rating as DoraMetric['rating'],
              trend: 'stable' as const,
              icon: 'clock' as const,
            },
            {
              name: 'Mean Time to Recovery',
              value: (data.mttr.avg / 60).toFixed(0), // Convert seconds to minutes
              unit: 'minutes',
              rating: data.mttr.rating as DoraMetric['rating'],
              trend: 'stable' as const,
              icon: 'alert' as const,
            },
            {
              name: 'Change Failure Rate',
              value: data.changeFailureRate.rate.toFixed(0),
              unit: '%',
              rating: data.changeFailureRate.rating as DoraMetric['rating'],
              trend: 'stable' as const,
              icon: 'target' as const,
            },
          ];

          setMetrics(transformedMetrics);
        }

        // Fetch trend data
        const trendParams = new URLSearchParams({
          metrics: 'deployment_frequency,lead_time,success_rate',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });

        if (projectId) {
          trendParams.append('projectId', projectId.toString());
        }

        const trendResponse = await axios.get(`/api/trends?${trendParams}`);

        if (trendResponse.data.success && trendResponse.data.data) {
          const trends = trendResponse.data.data;

          setTrendData({
            deploymentFrequency: trends.deployment_frequency?.data || [],
            leadTime: trends.lead_time?.data || [],
            successRate: trends.success_rate?.data || [],
          });
        }

      } catch (err) {
        console.error('Failed to fetch DORA metrics:', err);
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [projectId, period]);

  return { loading, error, metrics, trendData };
}
