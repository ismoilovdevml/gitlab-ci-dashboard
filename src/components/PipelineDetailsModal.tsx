'use client';

import { useEffect, useState } from 'react';
import { X, ExternalLink, Clock, GitCommit, PlayCircle, RotateCw, XCircle } from 'lucide-react';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { useDashboardStore } from '@/store/dashboard-store';
import { getStatusColor, getStatusIcon, formatDuration, formatRelativeTime } from '@/lib/utils';
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
  const { gitlabUrl, gitlabToken } = useDashboardStore();
  const { notifySuccess, notifyError } = useNotifications();
  const { theme, surface, border, textPrimary, textSecondary } = useTheme();
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
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
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
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
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
        const api = getGitLabAPI(gitlabUrl, gitlabToken);
        const jobLogs = await api.getJobTrace(projectId, selectedJob.id);
        setLogs(jobLogs);
      } catch (error) {
        console.error('Failed to refresh logs:', error);
      }
    }
  };

  const handleRetryPipeline = async () => {
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.retryPipeline(projectId, pipeline.id);
      window.location.reload();
    } catch (error) {
      console.error('Failed to retry pipeline:', error);
    }
  };

  const handleCancelPipeline = async () => {
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.cancelPipeline(projectId, pipeline.id);
      window.location.reload();
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
    }
  };

  const handleRetryJob = async (job: Job) => {
    try {
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
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
      const api = getGitLabAPI(gitlabUrl, gitlabToken);
      await api.cancelJob(projectId, job.id);
      notifySuccess('Job Canceled', `Job "${job.name}" has been canceled`);
      loadJobs();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      notifyError('Cancel Failed', `Failed to cancel job "${job.name}"`);
    }
  };


  return (
    <div className={`fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto ${
      theme === 'light' ? 'bg-black/30' : 'bg-black/80'
    }`}>
      <div className={`rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto ${surface} ${border}`}>
        {/* Header */}
        <div className={`sticky top-0 p-6 flex items-center justify-between ${surface} ${
          theme === 'light' ? 'border-b border-gray-200' : 'border-b border-zinc-800'
        }`}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className={`text-2xl font-bold ${textPrimary}`}>Pipeline #{pipeline.id}</h2>
              <div className={`px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1 ${getStatusColor(pipeline.status)}`}>
                <span>{getStatusIcon(pipeline.status)}</span>
                <span>{pipeline.status}</span>
              </div>
            </div>
            <div className={`flex items-center gap-4 text-sm ${textSecondary}`}>
              <div className="flex items-center gap-1">
                <GitCommit className="w-4 h-4" />
                <span className="font-mono">{pipeline.sha.substring(0, 8)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatRelativeTime(pipeline.created_at)}</span>
              </div>
              {pipeline.duration && (
                <div className="flex items-center gap-1">
                  <PlayCircle className="w-4 h-4" />
                  <span>{formatDuration(pipeline.duration)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pipeline.status === 'failed' && (
              <button
                onClick={handleRetryPipeline}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                Retry
              </button>
            )}
            {(pipeline.status === 'running' || pipeline.status === 'pending') && (
              <button
                onClick={handleCancelPipeline}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            )}
            <a
              href={pipeline.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 transition-colors ${
                theme === 'light' ? 'text-gray-500 hover:text-gray-900' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              onClick={onClose}
              className={`p-2 transition-colors ${
                theme === 'light' ? 'text-gray-500 hover:text-gray-900' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Info */}
        <div className={`p-6 ${
          theme === 'light'
            ? 'border-b border-gray-200 bg-gray-50'
            : 'border-b border-zinc-800 bg-zinc-800/50'
        }`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className={`text-xs mb-1 ${textSecondary}`}>Branch</p>
              <p className={`font-mono px-3 py-2 rounded ${textPrimary} ${
                theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900'
              }`}>{pipeline.ref}</p>
            </div>
            <div>
              <p className={`text-xs mb-1 ${textSecondary}`}>Commit</p>
              <p className={`font-mono px-3 py-2 rounded ${textPrimary} ${
                theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900'
              }`}>{pipeline.sha.substring(0, 16)}</p>
            </div>
            <div>
              <p className={`text-xs mb-1 ${textSecondary}`}>Triggered by</p>
              <div className={`flex items-center gap-2 px-3 py-2 rounded ${
                theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900'
              }`}>
                {pipeline.user?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pipeline.user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                )}
                <span className={textPrimary}>{pipeline.user?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Jobs Visualization */}
        <div className="p-6">
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>
            Pipeline Jobs ({jobs.length})
          </h3>

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
            <div className="text-center py-12">
              <PlayCircle className={`w-16 h-16 mx-auto mb-4 ${
                theme === 'light' ? 'text-gray-400' : 'text-zinc-700'
              }`} />
              <p className={textSecondary}>No jobs found for this pipeline</p>
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
