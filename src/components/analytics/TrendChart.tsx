'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '@/hooks/useTheme';

interface TrendChartProps {
  data: Array<{
    timestamp: Date | string;
    value: number;
    [key: string]: unknown;
  }>;
  title: string;
  yAxisLabel?: string;
  color?: string;
}

export default function TrendChart({ data, title, yAxisLabel, color = '#3b82f6' }: TrendChartProps) {
  const { theme, card, textPrimary } = useTheme();

  const chartData = data.map((point) => ({
    ...point,
    timestamp: typeof point.timestamp === 'string'
      ? new Date(point.timestamp).toLocaleDateString()
      : point.timestamp.toLocaleDateString(),
  }));

  return (
    <div className={`${card} p-6 rounded-lg`}>
      <h3 className={`text-lg font-semibold ${textPrimary} mb-6`}>
        {title}
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={theme === 'light' ? '#e5e7eb' : '#374151'}
          />
          <XAxis
            dataKey="timestamp"
            stroke={theme === 'light' ? '#6b7280' : '#9ca3af'}
            style={{ fontSize: '12px' }}
          />
          <YAxis
            label={{ value: yAxisLabel || '', angle: -90, position: 'insideLeft' }}
            stroke={theme === 'light' ? '#6b7280' : '#9ca3af'}
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
              border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
              borderRadius: '0.5rem',
              color: theme === 'light' ? '#111827' : '#f9fafb',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
