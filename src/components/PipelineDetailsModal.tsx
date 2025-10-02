'use client';

import { useEffect, useState } from 'react';
import { X, ExternalLink, Clock, GitCommit, PlayCircle, RotateCw, XCircle } from 'lucide-react';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { useDashboardStore } from '@/store/dashboard-store';
import { getStatusColor, getStatusIcon, formatDuration, formatRelativeTime } from '@/lib/utils';
import JobCard from './JobCard';
import LogViewer from './LogViewer';

interface PipelineDetailsModalProps {
  pipeline: Pipeline;
  projectId: number;
  onClose: () => void;
}

export default function PipelineDetailsModal({ pipeline, projectId, onClose }: PipelineDetailsModalProps) {
  const { gitlabUrl, gitlabToken } = useDashboardStore();
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

  // Group jobs by stage
  const jobsByStage = jobs.reduce((acc, job) => {
    if (!acc[job.stage]) acc[job.stage] = [];
    acc[job.stage].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-white">Pipeline #{pipeline.id}</h2>
              <div className={`px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1 ${getStatusColor(pipeline.status)}`}>
                <span>{getStatusIcon(pipeline.status)}</span>
                <span>{pipeline.status}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-zinc-400">
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

        {/* Pipeline Info */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-800/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Branch</p>
              <p className="text-white font-mono bg-zinc-900 px-3 py-2 rounded">{pipeline.ref}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Commit</p>
              <p className="text-white font-mono bg-zinc-900 px-3 py-2 rounded">{pipeline.sha.substring(0, 16)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Triggered by</p>
              <div className="flex items-center gap-2 bg-zinc-900 px-3 py-2 rounded">
                {pipeline.user?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pipeline.user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                )}
                <span className="text-white">{pipeline.user?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Jobs by Stage */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Pipeline Jobs ({jobs.length})
          </h3>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className="text-zinc-500 mt-4">Loading jobs...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(jobsByStage).map(([stage, stageJobs]) => (
                <div key={stage}>
                  <h4 className="text-md font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    Stage: {stage}
                    <span className="text-xs text-zinc-500">({stageJobs.length} jobs)</span>
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {stageJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onViewLogs={() => loadJobLogs(job)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {jobs.length === 0 && !loading && (
            <div className="text-center py-12">
              <PlayCircle className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">No jobs found for this pipeline</p>
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
