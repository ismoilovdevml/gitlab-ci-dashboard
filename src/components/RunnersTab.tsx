'use client';

import { useEffect, useState } from 'react';
import { Server, Circle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

export default function RunnersTab() {
  const { runners, setRunners } = useDashboardStore();
  const { theme, textPrimary, textSecondary, card } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRunners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRunners = async () => {
    try {
      setIsLoading(true);
      const api = getGitLabAPI();
      const runnersList = await api.getRunners(1, 50);
      setRunners(runnersList);
    } catch (error) {
      console.error('Failed to load runners:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRunnerStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'offline':
        return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'paused':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Runners</h1>
        <p className={textSecondary}>GitLab CI/CD runners status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {runners.map((runner) => (
          <div
            key={runner.id}
            className={`rounded-xl p-6 transition-all ${card} ${
              theme === 'light'
                ? 'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                : 'hover:border-zinc-700'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`font-semibold ${textPrimary}`}>
                    {runner.description || runner.name || `Runner #${runner.id}`}
                  </h3>
                  <p className={`text-xs ${textSecondary}`}>
                    {runner.runner_type} {runner.is_shared ? '• Shared' : ''}
                  </p>
                </div>
              </div>
              <div className={cn(
                'px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-2',
                getRunnerStatusColor(runner.status)
              )}>
                <Circle className={cn('w-2 h-2 fill-current', runner.online && 'animate-pulse')} />
                <span>{runner.status}</span>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className={textSecondary}>IP Address:</span>
                <span className={`font-mono ${textPrimary}`}>{runner.ip_address || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={textSecondary}>Platform:</span>
                <span className={textPrimary}>{runner.platform || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={textSecondary}>Architecture:</span>
                <span className={textPrimary}>{runner.architecture || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={textSecondary}>Last Contact:</span>
                <span className={textPrimary}>
                  {runner.contacted_at ? formatRelativeTime(runner.contacted_at) : 'Never'}
                </span>
              </div>
            </div>

            {runner.projects && runner.projects.length > 0 && (
              <div className={`pt-4 border-t ${theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'}`}>
                <p className={`text-xs mb-2 ${textSecondary}`}>Associated Projects:</p>
                <div className="flex flex-wrap gap-2">
                  {runner.projects.slice(0, 3).map((project) => (
                    <span
                      key={project.id}
                      className={`text-xs px-2 py-1 rounded ${
                        theme === 'light' ? 'bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {project.name}
                    </span>
                  ))}
                  {runner.projects.length > 3 && (
                    <span className={`text-xs ${textSecondary}`}>
                      +{runner.projects.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {runners.length === 0 && !isLoading && (
        <div className={`rounded-xl p-12 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
          <Server className={`w-16 h-16 mx-auto mb-4 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
          <p className={`text-lg ${textSecondary}`}>No runners found</p>
          <p className={`text-sm mt-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-600'}`}>Configure runners to execute CI/CD jobs</p>
        </div>
      )}
    </div>
  );
}
