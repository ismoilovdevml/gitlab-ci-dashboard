'use client';

import { useEffect, useState } from 'react';
import { Server, Circle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { formatRelativeTime, cn } from '@/lib/utils';

export default function RunnersTab() {
  const { runners, setRunners } = useDashboardStore();
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
        <h1 className="text-3xl font-bold text-white mb-2">Runners</h1>
        <p className="text-zinc-400">GitLab CI/CD runners status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {runners.map((runner) => (
          <div
            key={runner.id}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">
                    {runner.description || runner.name || `Runner #${runner.id}`}
                  </h3>
                  <p className="text-xs text-zinc-500">
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
                <span className="text-zinc-400">IP Address:</span>
                <span className="text-white font-mono">{runner.ip_address || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Platform:</span>
                <span className="text-white">{runner.platform || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Architecture:</span>
                <span className="text-white">{runner.architecture || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Last Contact:</span>
                <span className="text-white">
                  {runner.contacted_at ? formatRelativeTime(runner.contacted_at) : 'Never'}
                </span>
              </div>
            </div>

            {runner.projects && runner.projects.length > 0 && (
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">Associated Projects:</p>
                <div className="flex flex-wrap gap-2">
                  {runner.projects.slice(0, 3).map((project) => (
                    <span
                      key={project.id}
                      className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded"
                    >
                      {project.name}
                    </span>
                  ))}
                  {runner.projects.length > 3 && (
                    <span className="text-xs text-zinc-500">
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <Server className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 text-lg">No runners found</p>
          <p className="text-zinc-600 text-sm mt-2">Configure runners to execute CI/CD jobs</p>
        </div>
      )}
    </div>
  );
}
