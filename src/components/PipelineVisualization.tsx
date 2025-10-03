'use client';

import { Job } from '@/lib/gitlab-api';
import { CheckCircle, XCircle, Clock, PlayCircle, AlertCircle, RotateCw, Play, Ban, FileText } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface PipelineVisualizationProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onRetryJob?: (job: Job) => void;
  onCancelJob?: (job: Job) => void;
  onViewLogs?: (job: Job) => void;
}

export default function PipelineVisualization({
  jobs,
  onJobClick,
  onRetryJob,
  onCancelJob,
  onViewLogs
}: PipelineVisualizationProps) {
  const { theme, textPrimary, textSecondary } = useTheme();

  // Sort jobs by created_at to maintain pipeline execution order
  const sortedJobs = [...jobs].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Group jobs by stage while maintaining order
  const stageOrder: string[] = [];
  const stages = sortedJobs.reduce((acc, job) => {
    const stage = job.stage || 'default';
    if (!acc[stage]) {
      acc[stage] = [];
      stageOrder.push(stage); // Track stage order as we encounter them
    }
    acc[stage].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  // Use stageOrder instead of Object.keys to maintain correct order
  const stageNames = stageOrder;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <PlayCircle className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'canceled':
        return <Ban className="w-5 h-5 text-gray-500" />;
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
      default:
        return <Clock className="w-5 h-5 text-zinc-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'border-green-500 bg-green-500/10';
      case 'failed':
        return 'border-red-500 bg-red-500/10';
      case 'running':
        return 'border-blue-500 bg-blue-500/10';
      case 'pending':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'canceled':
        return 'border-gray-500 bg-gray-500/10';
      default:
        return 'border-zinc-700 bg-zinc-800/50';
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const totalSeconds = Math.round(seconds);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Stage Pipeline Visualization */}
      <div className="flex items-start gap-2 overflow-x-auto pb-4">
        {stageNames.map((stageName, index) => (
          <div key={stageName} className="flex items-center">
            {/* Stage Box */}
            <div className="flex flex-col items-center min-w-[180px]">
              {/* Stage Header */}
              <div className={`w-full rounded-t-lg px-4 py-2 ${
                theme === 'light'
                  ? 'bg-gray-200 border border-gray-300'
                  : 'bg-zinc-800 border border-zinc-700'
              }`}>
                <h3 className={`font-semibold text-sm truncate ${textPrimary}`}>{stageName}</h3>
              </div>

              {/* Stage Jobs */}
              <div className={`w-full border border-t-0 rounded-b-lg p-2 space-y-2 ${
                theme === 'light'
                  ? 'bg-white border-gray-300'
                  : 'bg-zinc-900 border-zinc-800'
              }`}>
                {stages[stageName].map((job) => (
                  <div
                    key={job.id}
                    className={`border-2 rounded-lg p-3 cursor-pointer transition-all hover:scale-105 ${getStatusColor(job.status)}`}
                    onClick={() => onJobClick(job)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(job.status)}
                      <span className={`text-sm font-medium truncate flex-1 ${textPrimary}`}>
                        {job.name}
                      </span>
                    </div>

                    <div className={`text-xs mb-2 ${textSecondary}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(job.duration)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      {job.status === 'success' && onRetryJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryJob(job);
                          }}
                          className={`p-1.5 hover:bg-orange-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="Retry job"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {job.status === 'failed' && onRetryJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryJob(job);
                          }}
                          className={`p-1.5 hover:bg-orange-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="Retry job"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {job.status === 'running' && onCancelJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelJob(job);
                          }}
                          className={`p-1.5 hover:bg-red-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="Cancel job"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {job.status === 'pending' && onCancelJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelJob(job);
                          }}
                          className={`p-1.5 hover:bg-red-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="Cancel job"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {job.status === 'manual' && onRetryJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryJob(job);
                          }}
                          className={`p-1.5 hover:bg-green-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="Run job"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {onViewLogs && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewLogs(job);
                          }}
                          className={`p-1.5 hover:bg-blue-500 rounded transition-colors ${
                            theme === 'light' ? 'bg-gray-200 hover:text-white' : 'bg-zinc-800'
                          }`}
                          title="View logs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connector Arrow */}
            {index < stageNames.length - 1 && (
              <div className="flex items-center px-2 pb-8">
                <div className={`w-8 h-0.5 ${
                  theme === 'light' ? 'bg-gray-400' : 'bg-zinc-700'
                }`}></div>
                <div className={`w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 ${
                  theme === 'light' ? 'border-l-gray-400' : 'border-l-zinc-700'
                }`}></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
