'use client';

import { TrendingUp, TrendingDown, Minus, Activity, Clock, AlertTriangle, Target, Info } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useState } from 'react';

interface DoraMetric {
  name: string;
  value: string;
  unit: string;
  rating: 'elite' | 'high' | 'medium' | 'low';
  trend?: 'up' | 'down' | 'stable';
  icon: 'activity' | 'clock' | 'alert' | 'target';
  description?: string;
}

interface DoraMetricsCardProps {
  metrics: DoraMetric[];
}

export default function DoraMetricsCard({ metrics }: DoraMetricsCardProps) {
  const { theme, card, textPrimary, textSecondary } = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getMetricDescription = (name: string) => {
    switch (name) {
      case 'Deployment Frequency':
        return 'How often code is deployed to production. Elite: Multiple times per day';
      case 'Lead Time for Changes':
        return 'Time from code commit to production deployment. Elite: Less than 1 hour';
      case 'Mean Time to Recovery':
        return 'Time to recover from a production incident. Elite: Less than 1 hour';
      case 'Change Failure Rate':
        return 'Percentage of deployments causing failures. Elite: 0-15%';
      default:
        return '';
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'elite':
        return theme === 'light' ? 'text-green-600 bg-green-50 border-green-200' : 'text-green-400 bg-green-900/20 border-green-800';
      case 'high':
        return theme === 'light' ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-blue-400 bg-blue-900/20 border-blue-800';
      case 'medium':
        return theme === 'light' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 'text-yellow-400 bg-yellow-900/20 border-yellow-800';
      case 'low':
        return theme === 'light' ? 'text-red-600 bg-red-50 border-red-200' : 'text-red-400 bg-red-900/20 border-red-800';
      default:
        return '';
    }
  };

  const getIcon = (icon: string) => {
    const className = 'w-5 h-5';
    switch (icon) {
      case 'activity':
        return <Activity className={className} />;
      case 'clock':
        return <Clock className={className} />;
      case 'alert':
        return <AlertTriangle className={className} />;
      case 'target':
        return <Target className={className} />;
      default:
        return <Activity className={className} />;
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (!trend) return null;
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={`${card} p-6 rounded-lg`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={`text-lg font-semibold ${textPrimary}`}>
          DORA Metrics
        </h3>
        <span className={`text-sm ${textSecondary}`}>DevOps Performance</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border transition-all relative ${
              theme === 'light' ? 'bg-gray-50 border-gray-200 hover:border-gray-300' : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
            }`}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${getRatingColor(metric.rating)}`}>
                {getIcon(metric.icon)}
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(metric.trend)}
                <button
                  className={`p-1 rounded-full transition-colors ${
                    theme === 'light' ? 'hover:bg-gray-200' : 'hover:bg-zinc-700'
                  }`}
                  title={getMetricDescription(metric.name)}
                >
                  <Info className={`w-4 h-4 ${textSecondary}`} />
                </button>
              </div>
            </div>

            {/* Tooltip */}
            {hoveredIndex === index && (
              <div className={`absolute top-full left-0 right-0 mt-2 p-3 rounded-lg shadow-lg z-10 text-xs ${
                theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-800 border border-zinc-700'
              }`}>
                <p className={textSecondary}>{getMetricDescription(metric.name)}</p>
              </div>
            )}

            <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>
              {metric.name}
            </h4>

            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${textPrimary}`}>
                {metric.value}
              </span>
              <span className={`text-sm ${textSecondary}`}>
                {metric.unit}
              </span>
            </div>

            <div className="mt-3">
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRatingColor(
                  metric.rating
                )}`}
              >
                {metric.rating.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-6 p-4 rounded-lg border ${
        theme === 'light' ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-800'
      }`}>
        <p className={`text-sm ${theme === 'light' ? 'text-blue-800' : 'text-blue-300'}`}>
          <strong>DORA Metrics</strong> measure software delivery performance based on Google&apos;s DevOps Research and Assessment team research.
        </p>
      </div>
    </div>
  );
}
