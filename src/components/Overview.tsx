'use client';

import { useEffect } from 'react';
import { Activity, GitBranch, CheckCircle, XCircle, Clock, PlayCircle } from 'lucide-react';
import StatsCard from './StatsCard';
import PipelineCard from './PipelineCard';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';

export default function Overview() {
  const {
    activePipelines,
    stats,
    setActivePipelines,
    setStats,
    setIsLoading,
    autoRefresh,
    refreshInterval
  } = useDashboardStore();

  const loadData = async () => {
    try {
      setIsLoading(true);
      const api = getGitLabAPI();

      const [pipelines, pipelineStats] = await Promise.all([
        api.getAllActivePipelines(),
        api.getPipelineStats(),
      ]);

      setActivePipelines(pipelines);
      setStats(pipelineStats);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (autoRefresh) {
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
        <p className="text-zinc-400">Real-time CI/CD pipeline monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Pipelines"
          value={stats?.total || 0}
          icon={GitBranch}
          color="blue"
        />
        <StatsCard
          title="Running"
          value={stats?.running || 0}
          icon={Activity}
          color="blue"
        />
        <StatsCard
          title="Successful"
          value={stats?.success || 0}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Failed"
          value={stats?.failed || 0}
          icon={XCircle}
          color="red"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Active Pipelines</h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-zinc-500">Live updates every {refreshInterval / 1000}s</span>
          </div>
        </div>

        {activePipelines.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
            <PlayCircle className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500 text-lg">No active pipelines</p>
            <p className="text-zinc-600 text-sm mt-2">All pipelines are idle or completed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {activePipelines.slice(0, 12).map((pipeline) => (
              <PipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                onClick={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
