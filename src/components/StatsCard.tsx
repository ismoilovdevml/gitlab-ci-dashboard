'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
}

export default function StatsCard({ title, value, icon: Icon, trend, color = 'blue' }: StatsCardProps) {
  const { theme, textPrimary } = useTheme();

  const getColorClasses = () => {
    const colors = {
      blue: {
        light: 'from-blue-50 to-blue-100 border-blue-200 hover:from-blue-100 hover:to-blue-200',
        dark: 'from-blue-500/10 to-blue-600/20 border-blue-500/30 hover:from-blue-500/20 hover:to-blue-600/30',
        icon: 'bg-blue-500/20',
        iconDark: 'bg-blue-500/10',
        text: theme === 'light' ? 'text-blue-700' : 'text-blue-400',
      },
      green: {
        light: 'from-green-50 to-green-100 border-green-200 hover:from-green-100 hover:to-green-200',
        dark: 'from-green-500/10 to-green-600/20 border-green-500/30 hover:from-green-500/20 hover:to-green-600/30',
        icon: 'bg-green-500/20',
        iconDark: 'bg-green-500/10',
        text: theme === 'light' ? 'text-green-700' : 'text-green-400',
      },
      red: {
        light: 'from-red-50 to-red-100 border-red-200 hover:from-red-100 hover:to-red-200',
        dark: 'from-red-500/10 to-red-600/20 border-red-500/30 hover:from-red-500/20 hover:to-red-600/30',
        icon: 'bg-red-500/20',
        iconDark: 'bg-red-500/10',
        text: theme === 'light' ? 'text-red-700' : 'text-red-400',
      },
      yellow: {
        light: 'from-yellow-50 to-yellow-100 border-yellow-200 hover:from-yellow-100 hover:to-yellow-200',
        dark: 'from-yellow-500/10 to-yellow-600/20 border-yellow-500/30 hover:from-yellow-500/20 hover:to-yellow-600/30',
        icon: 'bg-yellow-500/20',
        iconDark: 'bg-yellow-500/10',
        text: theme === 'light' ? 'text-yellow-700' : 'text-yellow-400',
      },
      purple: {
        light: 'from-purple-50 to-purple-100 border-purple-200 hover:from-purple-100 hover:to-purple-200',
        dark: 'from-purple-500/10 to-purple-600/20 border-purple-500/30 hover:from-purple-500/20 hover:to-purple-600/30',
        icon: 'bg-purple-500/20',
        iconDark: 'bg-purple-500/10',
        text: theme === 'light' ? 'text-purple-700' : 'text-purple-400',
      },
      orange: {
        light: 'from-orange-50 to-orange-100 border-orange-200 hover:from-orange-100 hover:to-orange-200',
        dark: 'from-orange-500/10 to-orange-600/20 border-orange-500/30 hover:from-orange-500/20 hover:to-orange-600/30',
        icon: 'bg-orange-500/20',
        iconDark: 'bg-orange-500/10',
        text: theme === 'light' ? 'text-orange-700' : 'text-orange-400',
      },
    };
    return colors[color];
  };

  const colorClasses = getColorClasses();

  return (
    <div className={cn(
      'bg-gradient-to-br border rounded-xl p-6 transition-all hover:scale-105',
      theme === 'light' ? `${colorClasses.light} shadow-sm hover:shadow-md` : colorClasses.dark
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium mb-2 ${colorClasses.text}`}>{title}</p>
          <p className={`text-3xl font-bold mb-1 ${textPrimary}`}>{value}</p>
          {trend && (
            <div className={cn(
              'text-xs font-medium flex items-center gap-1',
              trend.isPositive ? 'text-green-500' : 'text-red-500'
            )}>
              <span>{trend.isPositive ? '↗' : '↘'}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={cn(
          'p-3 rounded-lg',
          theme === 'light' ? colorClasses.icon : colorClasses.iconDark
        )}>
          <Icon className={`w-6 h-6 ${colorClasses.text.replace('text-', 'text-')}`} />
        </div>
      </div>
    </div>
  );
}
