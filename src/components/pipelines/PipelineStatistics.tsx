'use client';

import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/hooks/useTheme';

interface PipelineStatisticsProps {
  stats: {
    total: number;
    success: number;
    failed: number;
    running: number;
    pending: number;
    successRate: string | number;
  };
}

export default function PipelineStatistics({ stats }: PipelineStatisticsProps) {
  const { theme, card, textPrimary, textSecondary } = useTheme();

  const chartData = [
    { name: 'Success', value: stats.success, color: '#10b981' },
    { name: 'Failed', value: stats.failed, color: '#ef4444' },
    { name: 'Running', value: stats.running, color: '#3b82f6' },
    { name: 'Pending', value: stats.pending, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  if (stats.total === 0) return null;

  return (
    <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
      <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
        <BarChart3 className="w-5 h-5 text-orange-500" />
        Pipeline Status Distribution
      </h3>
      <div className="grid grid-cols-2 gap-6">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => `${entry.name}: ${entry.value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col justify-center space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className={`text-sm ${textSecondary}`}>Success</span>
            </div>
            <span className={`text-sm font-semibold ${textPrimary}`}>{stats.success}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className={`text-sm ${textSecondary}`}>Failed</span>
            </div>
            <span className={`text-sm font-semibold ${textPrimary}`}>{stats.failed}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className={`text-sm ${textSecondary}`}>Running</span>
            </div>
            <span className={`text-sm font-semibold ${textPrimary}`}>{stats.running}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className={`text-sm ${textSecondary}`}>Pending</span>
            </div>
            <span className={`text-sm font-semibold ${textPrimary}`}>{stats.pending}</span>
          </div>
          <div className={`pt-3 border-t ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${textSecondary}`}>Success Rate</span>
              <span className={`text-lg font-bold ${
                parseFloat(stats.successRate as string) >= 80 ? 'text-green-500' :
                parseFloat(stats.successRate as string) >= 50 ? 'text-orange-500' : 'text-red-500'
              }`}>
                {stats.successRate}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
