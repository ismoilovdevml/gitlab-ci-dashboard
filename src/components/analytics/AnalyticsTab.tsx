'use client';

import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDoraMetrics } from '@/hooks/useDoraMetrics';
import DoraMetricsCard from './DoraMetricsCard';
import TrendChart from './TrendChart';
import { BarChart3, Calendar, AlertCircle } from 'lucide-react';

export default function AnalyticsTab() {
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [period, setPeriod] = useState('30d');

  // Fetch real data using the hook
  const { loading, error, metrics, trendData } = useDoraMetrics(undefined, period);

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertCircle className={`w-12 h-12 ${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} />
        <div className="text-center">
          <h3 className={`text-lg font-semibold ${textPrimary} mb-2`}>Failed to Load Analytics</h3>
          <p className={`${textSecondary}`}>{error}</p>
          <p className={`text-sm ${textSecondary} mt-2`}>
            Analytics data may not be available yet. Deploy some pipelines to generate metrics.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${textPrimary} flex items-center gap-2`}>
            <BarChart3 className="w-7 h-7" />
            Advanced Analytics
          </h2>
          <p className={`${textSecondary} mt-1`}>
            DORA metrics, trends, and performance insights
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <Calendar className={`w-5 h-5 ${textSecondary}`} />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className={`px-4 py-2 rounded-lg border ${
              theme === 'light'
                ? 'bg-white border-gray-300 text-gray-900'
                : 'bg-zinc-800 border-zinc-700 text-white'
            } focus:outline-none focus:ring-2 focus:ring-orange-500`}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* DORA Metrics */}
      {metrics && metrics.length > 0 ? (
        <DoraMetricsCard metrics={metrics} />
      ) : (
        <div className={`${card} p-8 text-center`}>
          <p className={`${textSecondary}`}>No DORA metrics data available yet</p>
          <p className={`text-sm ${textSecondary} mt-2`}>
            Deploy some pipelines to generate metrics
          </p>
        </div>
      )}

      {/* Trend Charts */}
      {trendData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {trendData.deploymentFrequency && trendData.deploymentFrequency.length > 0 && (
              <TrendChart
                data={trendData.deploymentFrequency}
                title="Deployment Frequency Trend"
                yAxisLabel="Deployments"
                color="#10b981"
              />
            )}
            {trendData.leadTime && trendData.leadTime.length > 0 && (
              <TrendChart
                data={trendData.leadTime}
                title="Lead Time Trend"
                yAxisLabel="Hours"
                color="#3b82f6"
              />
            )}
          </div>

          {trendData.successRate && trendData.successRate.length > 0 && (
            <div className="grid grid-cols-1">
              <TrendChart
                data={trendData.successRate}
                title="Pipeline Success Rate"
                yAxisLabel="Success Rate (%)"
                color="#f59e0b"
              />
            </div>
          )}
        </>
      )}

      {/* Quick Stats */}
      {metrics && metrics.length > 0 && (
        <div className={`${card} p-6 rounded-lg`}>
          <h3 className={`text-lg font-semibold ${textPrimary} mb-4 flex items-center gap-2`}>
            <BarChart3 className="w-5 h-5" />
            Quick Stats
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {metrics.map((metric, index) => (
              <div key={index} className={`p-4 rounded-lg ${
                theme === 'light' ? 'bg-gray-50' : 'bg-zinc-800/30'
              }`}>
                <p className={`text-xs ${textSecondary} mb-2`}>{metric.name}</p>
                <div className="flex items-baseline gap-1">
                  <p className={`text-xl font-bold ${textPrimary}`}>{metric.value}</p>
                  <span className={`text-xs ${textSecondary}`}>{metric.unit}</span>
                </div>
                <div className="mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    metric.rating === 'elite' ? 'bg-green-500/10 text-green-600' :
                    metric.rating === 'high' ? 'bg-blue-500/10 text-blue-600' :
                    metric.rating === 'medium' ? 'bg-yellow-500/10 text-yellow-600' :
                    'bg-red-500/10 text-red-600'
                  }`}>
                    {metric.rating.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
