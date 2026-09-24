'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ExternalLink, Activity, Layers, FileText } from 'lucide-react';
import { Job } from '@/lib/gitlab-api';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { getStatusColor, getStatusIcon, formatDuration } from '@/lib/utils';
import LogViewer from './LogViewer';
import JobLogContent from './JobLogContent';
import { parseJobLogCached } from '@/lib/log-parser';
import PipelineVisualization from './PipelineVisualization';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';

interface JobDetailsModalProps {
  job: Job;
  projectId: number;
  onClose: () => void;
}

export default function JobDetailsModal({ job, projectId, onClose }: JobDetailsModalProps) {
  const { notifySuccess, notifyError } = useNotifications();
  const { projects } = useDashboardStore();
  const { theme, surface, textPrimary, textSecondary } = useTheme();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineJobs, setPipelineJobs] = useState<Job[]>([]);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'pipeline' | 'logs'>('pipeline');
  // Id of the job whose pipeline jobs are loaded; null while a reload is in flight.
  const [pipelineJobsFor, setPipelineJobsFor] = useState<number | null>(null);
  const loadingPipeline = pipelineJobsFor !== job.id;

  // Get real project name from store or job data
  const project = projects.find(p => p.id === projectId) ||
                  projects.find(p => p.id === job.project?.id) ||
                  projects.find(p => p.id === job.pipeline?.project_id);
  const projectName = project?.name || job.project?.name || job.project?.name_with_namespace || 'Loading...';

  const parsedLog = useMemo(() => parseJobLogCached(logs), [logs]);

  const pipelineId = job.pipeline.id;

  useEffect(() => {
    let ignore = false;
    const jobId = job.id;
    getGitLabAPIAsync()
      .then((api) => api.getPipelineJobs(projectId, pipelineId))
      .then((jobs) => {
        if (!ignore) setPipelineJobs(jobs);
      })
      .catch((error) => {
        console.error('Failed to load pipeline jobs:', error);
      })
      .finally(() => {
        if (!ignore) setPipelineJobsFor(jobId);
      });
    return () => {
      ignore = true;
    };
  }, [job.id, projectId, pipelineId]);

  const loadPipelineJobs = async () => {
    const jobId = job.id;
    try {
      setPipelineJobsFor(null);
      const api = await getGitLabAPIAsync();
      const jobs = await api.getPipelineJobs(projectId, pipelineId);
      setPipelineJobs(jobs);
    } catch (error) {
      console.error('Failed to load pipeline jobs:', error);
    } finally {
      setPipelineJobsFor(jobId);
    }
  };

  const loadJobLogs = async () => {
    try {
      setLoading(true);
      const api = await getGitLabAPIAsync();
      const jobLogs = await api.getJobTrace(projectId, job.id);
      setLogs(jobLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs. The job may not have started yet or logs are not available.');
    } finally {
      setLoading(false);
    }
  };

  const refreshJobLogs = async () => {
    try {
      const api = await getGitLabAPIAsync();
      const jobLogs = await api.getJobTrace(projectId, job.id);
      setLogs(jobLogs);
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  };

  // Auto-refresh logs for running jobs
  useEffect(() => {
    if (selectedTab === 'logs' && job.status === 'running' && logs) {
      const interval = setInterval(() => {
        refreshJobLogs();
      }, 3000); // Refresh every 3 seconds

      return () => clearInterval(interval);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, job.status, logs]);

  // Load logs the first time the logs tab is opened
  const showLogsTab = () => {
    if (selectedTab !== 'logs' && !logs && !loading) {
      loadJobLogs();
    }
    setSelectedTab('logs');
  };

  const handleRetryJob = async (jobToRetry: Job) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.retryJob(projectId, jobToRetry.id);
      notifySuccess('Job Retrying', `Job "${jobToRetry.name}" is being retried`);
      setTimeout(() => {
        loadPipelineJobs();
      }, 1000);
    } catch (error) {
      console.error('Failed to retry job:', error);
      notifyError('Retry Failed', `Failed to retry job "${jobToRetry.name}"`);
    }
  };

  const handlePlayJob = async (jobToPlay: Job) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.playJob(projectId, jobToPlay.id);
      notifySuccess('Job Started', `Job "${jobToPlay.name}" has been started`);
      setTimeout(() => {
        loadPipelineJobs();
      }, 1000);
    } catch (error) {
      console.error('Failed to start job:', error);
      notifyError('Start Failed', `Failed to start job "${jobToPlay.name}"`);
    }
  };

  const handleCancelJob = async (jobToCancel: Job) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.cancelJob(projectId, jobToCancel.id);
      notifySuccess('Job Canceled', `Job "${jobToCancel.name}" has been canceled`);
      setTimeout(() => {
        loadPipelineJobs();
      }, 1000);
    } catch (error) {
      console.error('Failed to cancel job:', error);
      notifyError('Cancel Failed', `Failed to cancel job "${jobToCancel.name}"`);
    }
  };

  const handleJobClick = (clickedJob: Job) => {
    // If same job, just scroll to logs or open log viewer
    if (clickedJob.id === job.id) {
      setSelectedTab('logs');
      if (!logs && !loading) {
        loadJobLogs();
      }
    }
  };

  const handleViewLogs = (logJob: Job) => {
    if (logJob.id === job.id) {
      setShowLogViewer(true);
      if (!logs && !loading) {
        loadJobLogs();
      }
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-999 backdrop-blur-xs ${
          theme === 'light' ? 'bg-black/50' : 'bg-black/80'
        }`}
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-999 flex items-center justify-center p-0 sm:p-4 pointer-events-none overflow-y-auto">
        <div
          className={`sm:rounded-xl w-full max-w-7xl h-dvh sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto ${surface} ${
            theme === 'light' ? 'shadow-2xl' : 'border border-zinc-800'
          }`}
        >
          {/* Header */}
          <div className={`p-4 sm:p-6 flex items-start sm:items-center justify-between gap-3 border-b ${
            theme === 'light' ? 'border-gray-200 bg-linear-to-r from-gray-50 to-white' : 'border-zinc-800 bg-linear-to-r from-zinc-900 to-zinc-800'
          }`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  theme === 'light' ? 'bg-white border border-gray-200' : 'bg-zinc-900 border border-zinc-700'
                }`}>
                  <Activity className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h2 className={`text-xl sm:text-2xl font-bold break-words ${textPrimary}`}>{job.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    <div className={`px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1.5 ${getStatusColor(job.status)}`}>
                      <span>{getStatusIcon(job.status)}</span>
                      <span>{job.status}</span>
                    </div>
                    <span className={`text-xs ${textSecondary}`}>•</span>
                    <span className={`text-xs ${textSecondary}`}>{projectName}</span>
                    <span className={`text-xs ${textSecondary}`}>•</span>
                    <span className={`text-xs ${textSecondary}`}>Stage: {job.stage}</span>
                    {job.duration && (
                      <>
                        <span className={`text-xs ${textSecondary}`}>•</span>
                        <span className={`text-xs ${textSecondary}`}>{formatDuration(job.duration)}</span>
                      </>
                    )}
                    {job.status === 'running' && (
                      <>
                        <span className={`text-xs ${textSecondary}`}>•</span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                          <span className="text-blue-400 text-xs font-medium">LIVE</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={job.web_url}
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
                className={`p-2 max-sm:p-2.5 shrink-0 rounded-lg transition-all hover:scale-105 ${
                  theme === 'light' ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${
            theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/50'
          }`}>
            <button
              onClick={() => setSelectedTab('pipeline')}
              className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors relative ${
                selectedTab === 'pipeline'
                  ? theme === 'light'
                    ? 'text-blue-600 bg-white'
                    : 'text-blue-400 bg-zinc-900'
                  : textSecondary
              }`}
            >
              <Layers className="w-4 h-4" />
              Pipeline Stages
              {selectedTab === 'pipeline' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
              )}
            </button>
            <button
              onClick={showLogsTab}
              className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors relative ${
                selectedTab === 'logs'
                  ? theme === 'light'
                    ? 'text-blue-600 bg-white'
                    : 'text-blue-400 bg-zinc-900'
                  : textSecondary
              }`}
            >
              <FileText className="w-4 h-4" />
              Job Logs
              {job.status === 'running' && selectedTab === 'logs' && (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              )}
              {selectedTab === 'logs' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {selectedTab === 'pipeline' && (
              <div className="p-6">
                {loadingPipeline ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : pipelineJobs.length > 0 ? (
                  <PipelineVisualization
                    jobs={pipelineJobs}
                    onJobClick={handleJobClick}
                    onRetryJob={handleRetryJob}
                    onCancelJob={handleCancelJob}
                    onPlayJob={handlePlayJob}
                    onViewLogs={handleViewLogs}
                  />
                ) : (
                  <div className={`text-center py-12 ${textSecondary}`}>
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No pipeline jobs found</p>
                  </div>
                )}
              </div>
            )}

            {selectedTab === 'logs' && (
              <div className="h-full">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                      <p className={`text-sm ${textSecondary}`}>Loading logs...</p>
                    </div>
                  </div>
                ) : (
                  // Bounded height: the log must scroll on its own for row virtualization to work.
                  <JobLogContent
                    id="job-log-container"
                    className="max-h-[calc(90vh-14rem)]"
                    log={parsedLog}
                    follow={job.status === 'running'}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {selectedTab === 'logs' && logs && (
            <div className={`p-4 border-t flex items-center justify-between ${
              theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/50'
            }`}>
              <div className="flex items-center gap-2 text-xs">
                <span className={textSecondary}>{parsedLog.lines.length} lines</span>
                {job.status === 'running' && (
                  <>
                    <span className={textSecondary}>•</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                      <span className="text-blue-400">Live updating every 3s</span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => setShowLogViewer(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                Open Full Log Viewer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full Log Viewer Modal */}
      {showLogViewer && (
        <LogViewer
          logs={logs}
          jobName={job.name}
          jobStatus={job.status}
          projectId={projectId}
          jobId={job.id}
          onClose={() => setShowLogViewer(false)}
          onRefreshLogs={refreshJobLogs}
        />
      )}
    </>
  );
}
