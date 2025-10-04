'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Zap, Users } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { Runner } from '@/lib/gitlab-api';
import { formatDuration } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface TimeSeriesData {
  date: string;
  success: number;
  failed: number;
  total: number;
  avgDuration: number;
}



export default function DashboardAnalytics() {
  const { setRunners: setGlobalRunners } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [loading, setLoading] = useState(true);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);

  useEffect(() => {
      loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics');
      const result = await response.json();

      if (result.data) {
        setTimeSeriesData(result.data.timeSeriesData);
        setRunners(result.data.runners);
        setGlobalRunners(result.data.runners);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const successRate = timeSeriesData.length > 0
    ? (timeSeriesData.reduce((acc, d) => acc + d.success, 0) /
       timeSeriesData.reduce((acc, d) => acc + d.total, 0) * 100) || 0
    : 0;

  const avgDuration = timeSeriesData.length > 0
    ? timeSeriesData.reduce((acc, d) => acc + d.avgDuration, 0) / timeSeriesData.length
    : 0;

  const activeRunners = runners.filter(r => r.active && r.online).length;
  const totalRunners = runners.length;

  const runnerUtilization = totalRunners > 0 ? (activeRunners / totalRunners) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <div className={`h-8 w-64 rounded-lg mb-2 animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
          <div className={`h-4 w-96 rounded animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
        </div>

        {/* Key Metrics Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`rounded-xl p-4 animate-pulse ${card}`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`h-4 w-24 rounded ${
                  theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
                }`} />
                <div className={`w-5 h-5 rounded ${
                  theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
                }`} />
              </div>
              <div className={`h-8 w-20 rounded mb-1 ${
                theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
              }`} />
              <div className={`h-3 w-32 rounded ${
                theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
              }`} />
            </div>
          ))}
        </div>

        {/* Chart Skeleton */}
        <div className={`rounded-xl p-6 ${card}`}>
          <div className={`h-6 w-48 rounded mb-4 animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
          <div className={`h-[300px] rounded animate-pulse ${
            theme === 'light' ? 'bg-gray-200' : 'bg-zinc-800'
          }`} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div>
        <h2 className={`text-2xl font-bold mb-2 ${textPrimary}`}>Analytics & Metrics</h2>
        <p className={textSecondary}>Last 7 days performance insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 shadow-sm'
            : 'bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Success Rate</span>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{successRate.toFixed(1)}%</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>7-day average</p>
        </div>

        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 shadow-sm'
            : 'bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Avg Build Time</span>
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{formatDuration(avgDuration)}</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>per pipeline</p>
        </div>

        <div className={`rounded-xl p-4 ${
          theme === 'light'
            ? 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 shadow-sm'
            : 'bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${textSecondary}`}>Runner Utilization</span>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <p className={`text-3xl font-bold ${textPrimary}`}>{runnerUtilization.toFixed(0)}%</p>
          <p className={`text-xs mt-1 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-500'}`}>{activeRunners} of {totalRunners} active</p>
        </div>
      </div>

      {/* Pipeline Success Rate Chart */}
      <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
        <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Pipeline Success Rate Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              stroke="#71717a"
              fontSize={12}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                color: '#fff'
              }}
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="success"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 3 }}
              name="Success"
            />
            <Line
              type="monotone"
              dataKey="failed"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 3 }}
              name="Failed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>



    </div>
  );
}
