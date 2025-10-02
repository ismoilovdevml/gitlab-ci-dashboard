'use client';

import { useEffect, useState } from 'react';
import { Activity, GitBranch, CheckCircle, XCircle, Clock, PlayCircle } from 'lucide-react';
import StatsCard from './StatsCard';
import PipelineCard from './PipelineCard';
import PipelineDetailsModal from './PipelineDetailsModal';
import PipelineListModal from './PipelineListModal';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { Pipeline } from '@/lib/gitlab-api';
import { getStatusIcon, formatRelativeTime, formatDuration } from '@/lib/utils';

export default function Overview() {
  const {
    activePipelines,
    stats,
    gitlabUrl,
    gitlabToken,
    projects,
    setActivePipelines,
    setStats,
    setIsLoading,
    setError,
    autoRefresh,
    refreshInterval
  } = useDashboardStore();

  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showPipelineList, setShowPipelineList] = useState<{ title: string; status?: string } | null>(null);
  const [recentPipelines, setRecentPipelines] = useState<Pipeline[]>([]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get API instance with custom URL and token from store
      const api = getGitLabAPI(gitlabUrl, gitlabToken);

      const [pipelines, pipelineStats] = await Promise.all([
        api.getAllActivePipelines(),
        api.getPipelineStats(),
      ]);

      setActivePipelines(pipelines);
      setStats(pipelineStats);

      // Load recent pipelines (last 10 from all projects)
      const recentPromises = projects.slice(0, 10).map(project =>
        api.getPipelines(project.id, 1, 5).catch(() => [])
      );
      const allRecent = await Promise.all(recentPromises);
      const recent = allRecent
        .flat()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 10);
      setRecentPipelines(recent);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      setError(error?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only load if we have token
    if (gitlabToken) {
      loadData();

      if (autoRefresh) {
        const interval = setInterval(loadData, refreshInterval);
        return () => clearInterval(interval);
      }
    }
  }, [autoRefresh, refreshInterval, gitlabToken, gitlabUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
        <p className="text-zinc-400">Real-time CI/CD pipeline monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => setShowPipelineList({ title: 'All Pipelines' })} className="cursor-pointer">
          <StatsCard
            title="Total Pipelines"
            value={stats?.total || 0}
            icon={GitBranch}
            color="blue"
          />
        </div>
        <div onClick={() => setShowPipelineList({ title: 'Running Pipelines', status: 'running' })} className="cursor-pointer">
          <StatsCard
            title="Running"
            value={stats?.running || 0}
            icon={Activity}
            color="blue"
          />
        </div>
        <div onClick={() => setShowPipelineList({ title: 'Successful Pipelines', status: 'success' })} className="cursor-pointer">
          <StatsCard
            title="Successful"
            value={stats?.success || 0}
            icon={CheckCircle}
            color="green"
          />
        </div>
        <div onClick={() => setShowPipelineList({ title: 'Failed Pipelines', status: 'failed' })} className="cursor-pointer">
          <StatsCard
            title="Failed"
            value={stats?.failed || 0}
            icon={XCircle}
            color="red"
          />
        </div>
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
                onClick={() => {
                  setSelectedPipeline(pipeline);
                  setSelectedProjectId(pipeline.project_id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Pipeline History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          <button
            onClick={() => setShowPipelineList({ title: 'All Recent Pipelines' })}
            className="text-sm text-orange-500 hover:text-orange-400 transition-colors"
          >
            View All →
          </button>
        </div>

        {recentPipelines.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPipelines.map((pipeline) => {
              const project = projects.find(p => p.id === pipeline.project_id);
              return (
                <div
                  key={pipeline.id}
                  onClick={() => {
                    setSelectedPipeline(pipeline);
                    setSelectedProjectId(pipeline.project_id);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* Status Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                      pipeline.status === 'success' ? 'bg-green-500/10 text-green-500' :
                      pipeline.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                      pipeline.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {getStatusIcon(pipeline.status)}
                    </div>

                    {/* Pipeline Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium group-hover:text-orange-500 transition-colors truncate">
                          {project?.name || 'Unknown Project'}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500 text-sm">#{pipeline.id}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded">{pipeline.ref}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(pipeline.updated_at)}</span>
                        {pipeline.duration && (
                          <>
                            <span>•</span>
                            <span>{formatDuration(pipeline.duration)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* User Avatar */}
                    {pipeline.user?.avatar_url && (
                      <img
                        src={pipeline.user.avatar_url}
                        alt={pipeline.user.name}
                        className="w-8 h-8 rounded-full"
                        title={pipeline.user.name}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Quick Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Active Projects</p>
                <p className="text-2xl font-bold text-white">{projects.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Avg Duration</p>
                <p className="text-2xl font-bold text-white">
                  {stats && stats.total > 0
                    ? formatDuration(
                        recentPipelines
                          .filter(p => p.duration)
                          .reduce((acc, p) => acc + (p.duration || 0), 0) /
                          recentPipelines.filter(p => p.duration).length
                      )
                    : '0s'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Success Rate</p>
                <p className="text-2xl font-bold text-white">
                  {stats && stats.total > 0
                    ? Math.round((stats.success / stats.total) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Today's Runs</p>
                <p className="text-2xl font-bold text-white">
                  {recentPipelines.filter(p => {
                    const today = new Date();
                    const pipelineDate = new Date(p.created_at);
                    return pipelineDate.toDateString() === today.toDateString();
                  }).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPipelineList && (
        <PipelineListModal
          title={showPipelineList.title}
          status={showPipelineList.status}
          onClose={() => setShowPipelineList(null)}
        />
      )}

      {selectedPipeline && selectedProjectId && (
        <PipelineDetailsModal
          pipeline={selectedPipeline}
          projectId={selectedProjectId}
          onClose={() => {
            setSelectedPipeline(null);
            setSelectedProjectId(null);
          }}
        />
      )}
    </div>
  );
}
