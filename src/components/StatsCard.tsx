'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

export default function StatsCard({ title, value, icon: Icon, trend, color = 'blue' }: StatsCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-600/10 border-blue-500/20 text-blue-500',
    green: 'from-green-500/10 to-green-600/10 border-green-500/20 text-green-500',
    red: 'from-red-500/10 to-red-600/10 border-red-500/20 text-red-500',
    yellow: 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/20 text-yellow-500',
    purple: 'from-purple-500/10 to-purple-600/10 border-purple-500/20 text-purple-500',
  };

  return (
    <div className={cn(
      'bg-gradient-to-br border rounded-xl p-6 transition-all hover:scale-105',
      colorClasses[color]
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-400 text-sm font-medium mb-2">{title}</p>
          <p className="text-3xl font-bold text-white mb-1">{value}</p>
          {trend && (
            <div className={cn(
              'text-xs font-medium flex items-center gap-1',
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            )}>
              <span>{trend.isPositive ? '↗' : '↘'}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
