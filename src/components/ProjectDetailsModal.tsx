'use client';

import { useEffect, useState } from 'react';
import { X, ExternalLink, GitBranch, Star, GitFork, Clock, Activity, CheckCircle, XCircle } from 'lucide-react';
import { Project, Pipeline } from '@/lib/gitlab-api';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { useDashboardStore } from '@/store/dashboard-store';
import { formatRelativeTime } from '@/lib/utils';
import PipelineCard from './PipelineCard';
import PipelineDetailsModal from './PipelineDetailsModal';

interface ProjectDetailsModalProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectDetailsModal({ project, onClose }: ProjectDetailsModalProps) {
  const { gitlabUrl, gitlabToken } = useDashboardStore();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    success: 0,
    failed: 0,
  });

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      const pipelinesList = await api.getPipelines(project.id, 1, 50);
      setPipelines(pipelinesList);

      // Calculate stats
      setStats({
        total: pipelinesList.length,
        running: pipelinesList.filter(p => p.status === 'running').length,
        success: pipelinesList.filter(p => p.status === 'success').length,
        failed: pipelinesList.filter(p => p.status === 'failed').length,
      });
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-7xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {project.avatar_url ? (
                <img src={project.avatar_url} alt={project.name} className="w-16 h-16 rounded-lg" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-white">{project.name}</h2>
                <p className="text-zinc-400 text-sm">{project.namespace.name}</p>
                <p className="text-zinc-500 text-xs font-mono mt-1">{project.path_with_namespace}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={project.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Project Info */}
          <div className="p-6 border-b border-zinc-800 bg-zinc-800/50">
            {project.description && (
              <p className="text-zinc-300 mb-4">{project.description}</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Star className="w-4 h-4" />
                  <span>Stars</span>
                </div>
                <p className="text-2xl font-bold text-white">{project.star_count}</p>
              </div>
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <GitFork className="w-4 h-4" />
                  <span>Forks</span>
                </div>
                <p className="text-2xl font-bold text-white">{project.forks_count}</p>
              </div>
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <GitBranch className="w-4 h-4" />
                  <span>Pipelines</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="bg-zinc-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Clock className="w-4 h-4" />
                  <span>Last Activity</span>
                </div>
                <p className="text-sm font-medium text-white">
                  {formatRelativeTime(project.last_activity_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Pipeline Stats */}
          <div className="p-6 border-b border-zinc-800">
            <h3 className="text-lg font-semibold text-white mb-4">Pipeline Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
                  <Activity className="w-4 h-4" />
                  <span>Running</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.running}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>Success</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.success}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
                  <XCircle className="w-4 h-4" />
                  <span>Failed</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.failed}</p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-purple-400 text-sm mb-1">
                  <GitBranch className="w-4 h-4" />
                  <span>Total</span>
                </div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </div>

          {/* Recent Pipelines */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Recent Pipelines ({pipelines.length})
            </h3>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
                <p className="text-zinc-500 mt-4">Loading pipelines...</p>
              </div>
            ) : pipelines.length === 0 ? (
              <div className="text-center py-12">
                <GitBranch className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No pipelines found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {pipelines.slice(0, 12).map((pipeline) => (
                  <PipelineCard
                    key={pipeline.id}
                    pipeline={pipeline}
                    onClick={() => setSelectedPipeline(pipeline)}
                  />
                ))}
              </div>
            )}

            {pipelines.length > 12 && (
              <div className="text-center mt-6">
                <p className="text-zinc-500 text-sm">
                  Showing 12 of {pipelines.length} pipelines
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPipeline && (
        <PipelineDetailsModal
          pipeline={selectedPipeline}
          projectId={project.id}
          onClose={() => setSelectedPipeline(null)}
        />
      )}
    </>
  );
}
