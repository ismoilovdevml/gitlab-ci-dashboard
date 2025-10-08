'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, ExternalLink, Clock, GitCommit, PlayCircle, RotateCw, XCircle, GitBranch, User, Timer, CheckCircle2, Activity } from 'lucide-react';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { useDashboardStore } from '@/store/dashboard-store';
import { getStatusColor, getStatusIcon, formatDuration, formatRelativeTime, formatPercentage } from '@/lib/utils';
import LogViewer from './LogViewer';
import PipelineVisualization from './PipelineVisualization';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';

interface PipelineDetailsModalProps {
  pipeline: Pipeline;
  projectId: number;
  onClose: () => void;
}

export default function PipelineDetailsModal({ pipeline, projectId, onClose }: PipelineDetailsModalProps) {
  const {  } = useDashboardStore();
  const { notifySuccess, notifyError } = useNotifications();
  const { theme, surface, textPrimary, textSecondary } = useTheme();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.id]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const api = await getGitLabAPIAsync();
      const jobsList = await api.getPipelineJobs(projectId, pipeline.id);
      setJobs(jobsList);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobLogs = async (job: Job) => {
    try {
      setSelectedJob(job);
      const api = await getGitLabAPIAsync();
      const jobLogs = await api.getJobTrace(projectId, job.id);
      setLogs(jobLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs');
    }
  };

  const refreshJobLogs = async () => {
    if (selectedJob) {
      try {
        const api = await getGitLabAPIAsync();
        const jobLogs = await api.getJobTrace(projectId, selectedJob.id);
        setLogs(jobLogs);
      } catch (error) {
        console.error('Failed to refresh logs:', error);
      }
    }
  };

  const handleRetryPipeline = async () => {
    try {
      const api = await getGitLabAPIAsync();
      await api.retryPipeline(projectId, pipeline.id);
      window.location.reload();
    } catch (error) {
      console.error('Failed to retry pipeline:', error);
    }
  };

  const handleCancelPipeline = async () => {
    try {
      const api = await getGitLabAPIAsync();
      await api.cancelPipeline(projectId, pipeline.id);
      window.location.reload();
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
    }
  };

  const handleRetryJob = async (job: Job) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.retryJob(projectId, job.id);
      notifySuccess('Job Retrying', `Job "${job.name}" is being retried`);
      loadJobs();
    } catch (error) {
      console.error('Failed to retry job:', error);
      notifyError('Retry Failed', `Failed to retry job "${job.name}"`);
    }
  };

  const handleCancelJob = async (job: Job) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.cancelJob(projectId, job.id);
      notifySuccess('Job Canceled', `Job "${job.name}" has been canceled`);
      loadJobs();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      notifyError('Cancel Failed', `Failed to cancel job "${job.name}"`);
    }
  };

  // Pipeline statistics
  const pipelineStats = useMemo(() => {
    const total = jobs.length;
    const success = jobs.filter(j => j.status === 'success').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const running = jobs.filter(j => j.status === 'running').length;
    const pending = jobs.filter(j => j.status === 'pending').length;
    const canceled = jobs.filter(j => j.status === 'canceled').length;
    const skipped = jobs.filter(j => j.status === 'skipped').length;

    const totalDuration = jobs.reduce((sum, job) => sum + (job.duration || 0), 0);
    const avgDuration = total > 0 ? totalDuration / total : 0;

    return {
      total, success, failed, running, pending, canceled, skipped,
      totalDuration, avgDuration,
      successRate: total > 0 ? formatPercentage((success / total) * 100) : '0'
    };
  }, [jobs]);


  return (
    <div className={`fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto ${
      theme === 'light' ? 'bg-black/30' : 'bg-black/80'
    }`}>
      <div className={`rounded-xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col ${surface} ${
        theme === 'light' ? 'shadow-2xl' : 'border border-zinc-800'
      }`}>
        {/* Header */}
        <div className={`p-6 flex items-center justify-between border-b ${
          theme === 'light' ? 'border-gray-200 bg-gradient-to-r from-gray-50 to-white' : 'border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-800'
        }`}>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${
                theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900 border border-zinc-700'
              }`}>
                <Activity className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${textPrimary}`}>Pipeline #{pipeline.id}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1.5 ${getStatusColor(pipeline.status)}`}>
                    <span>{getStatusIcon(pipeline.status)}</span>
                    <span>{pipeline.status}</span>
                  </div>
                  <span className={`text-xs ${textSecondary}`}>•</span>
                  <span className={`text-xs ${textSecondary}`}>{formatRelativeTime(pipeline.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pipeline.status === 'failed' && (
              <button
                onClick={handleRetryPipeline}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all hover:scale-105 flex items-center gap-2 shadow-lg"
              >
                <RotateCw className="w-4 h-4" />
                Retry
              </button>
            )}
            {(pipeline.status === 'running' || pipeline.status === 'pending') && (
              <button
                onClick={handleCancelPipeline}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all hover:scale-105 flex items-center gap-2 shadow-lg"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            )}
            <a
              href={pipeline.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition-all hover:scale-105 ${
                theme === 'light' ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
              title="Open in GitLab"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-all hover:scale-105 ${
                theme === 'light' ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Info & Statistics */}
        <div className={`p-6 border-b ${
          theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/50'
        }`}>
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className={`rounded-lg p-3 border ${
              theme === 'light' ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-xs font-medium ${textSecondary}`}>Branch</span>
              </div>
              <p className={`font-mono text-sm truncate ${textPrimary}`}>{pipeline.ref}</p>
            </div>
            <div className={`rounded-lg p-3 border ${
              theme === 'light' ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <GitCommit className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-xs font-medium ${textSecondary}`}>Commit</span>
              </div>
              <p className={`font-mono text-sm truncate ${textPrimary}`}>{pipeline.sha.substring(0, 12)}</p>
            </div>
            <div className={`rounded-lg p-3 border ${
              theme === 'light' ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <Timer className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-xs font-medium ${textSecondary}`}>Duration</span>
              </div>
              <p className={`text-sm font-semibold ${textPrimary}`}>{pipeline.duration ? formatDuration(pipeline.duration) : '-'}</p>
            </div>
            <div className={`rounded-lg p-3 border ${
              theme === 'light' ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <User className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-xs font-medium ${textSecondary}`}>Triggered by</span>
              </div>
              <div className="flex items-center gap-2">
                {pipeline.user?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pipeline.user.avatar_url} className="w-5 h-5 rounded-full" alt="" />
                )}
                <span className={`text-sm truncate ${textPrimary}`}>{pipeline.user?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>

          {/* Job Statistics - Only Essential */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-lg p-3 border transition-all ${
              theme === 'light'
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                : 'bg-gradient-to-br from-green-500/10 to-green-600/20 border-green-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className={`text-xs font-medium ${textSecondary}`}>Success</span>
              </div>
              <p className={`text-2xl font-bold text-green-500`}>{pipelineStats.success}</p>
            </div>
            <div className={`rounded-lg p-3 border transition-all ${
              theme === 'light'
                ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                : 'bg-gradient-to-br from-red-500/10 to-red-600/20 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className={`text-xs font-medium ${textSecondary}`}>Failed</span>
              </div>
              <p className={`text-2xl font-bold text-red-500`}>{pipelineStats.failed}</p>
            </div>
            {pipelineStats.running > 0 && (
              <div className={`rounded-lg p-3 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'
                  : 'bg-gradient-to-br from-blue-500/10 to-blue-600/20 border-blue-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <span className={`text-xs font-medium ${textSecondary}`}>Running</span>
                </div>
                <p className={`text-2xl font-bold text-blue-500`}>{pipelineStats.running}</p>
              </div>
            )}
            {pipelineStats.pending > 0 && (
              <div className={`rounded-lg p-3 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200'
                  : 'bg-gradient-to-br from-yellow-500/10 to-yellow-600/20 border-yellow-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  <span className={`text-xs font-medium ${textSecondary}`}>Pending</span>
                </div>
                <p className={`text-2xl font-bold text-yellow-500`}>{pipelineStats.pending}</p>
              </div>
            )}
            <div className={`rounded-lg p-3 border transition-all ${
              theme === 'light'
                ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200'
                : 'bg-gradient-to-br from-orange-500/10 to-orange-600/20 border-orange-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-orange-500" />
                <span className={`text-xs font-medium ${textSecondary}`}>Success Rate</span>
              </div>
              <p className={`text-2xl font-bold text-orange-500`}>{pipelineStats.successRate}%</p>
            </div>
          </div>
        </div>

        {/* Jobs Visualization */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-semibold ${textPrimary}`}>
              Pipeline Jobs ({jobs.length})
            </h3>
            {jobs.length > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                theme === 'light' ? 'bg-white border-gray-200' : 'bg-zinc-900 border-zinc-800'
              }`}>
                <Timer className={`w-3.5 h-3.5 ${textSecondary}`} />
                <span className={textSecondary}>Total Duration:</span>
                <span className={`font-bold ${textPrimary}`}>{formatDuration(pipelineStats.totalDuration)}</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className={`mt-4 ${textSecondary}`}>Loading jobs...</p>
            </div>
          ) : jobs.length > 0 ? (
            <PipelineVisualization
              jobs={jobs}
              onJobClick={loadJobLogs}
              onRetryJob={handleRetryJob}
              onCancelJob={handleCancelJob}
              onViewLogs={loadJobLogs}
            />
          ) : (
            <div className={`text-center py-12 rounded-xl border ${
              theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-zinc-900/50 border-zinc-800'
            }`}>
              <PlayCircle className={`w-16 h-16 mx-auto mb-4 ${
                theme === 'light' ? 'text-gray-400' : 'text-zinc-700'
              }`} />
              <p className={`text-lg font-semibold mb-1 ${textPrimary}`}>No Jobs Found</p>
              <p className={`text-sm ${textSecondary}`}>This pipeline doesn&apos;t have any jobs yet</p>
            </div>
          )}
        </div>
      </div>

      {selectedJob && logs && (
        <LogViewer
          logs={logs}
          jobName={selectedJob.name}
          jobStatus={selectedJob.status}
          projectId={projectId}
          jobId={selectedJob.id}
          onClose={() => {
            setSelectedJob(null);
            setLogs('');
          }}
          onRefreshLogs={refreshJobLogs}
        />
      )}
    </div>
  );
}
