'use client';

import { Job } from '@/lib/gitlab-api';
import { CheckCircle, XCircle, Clock, PlayCircle, AlertCircle, RotateCw, Play, Ban, FileText } from 'lucide-react';

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
  // Group jobs by stage
  const stages = jobs.reduce((acc, job) => {
    const stage = job.stage || 'default';
    if (!acc[stage]) {
      acc[stage] = [];
    }
    acc[stage].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  const stageNames = Object.keys(stages);

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
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
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
              <div className="w-full bg-zinc-800 border border-zinc-700 rounded-t-lg px-4 py-2">
                <h3 className="text-white font-semibold text-sm truncate">{stageName}</h3>
              </div>

              {/* Stage Jobs */}
              <div className="w-full bg-zinc-900 border border-zinc-800 border-t-0 rounded-b-lg p-2 space-y-2">
                {stages[stageName].map((job) => (
                  <div
                    key={job.id}
                    className={`border-2 rounded-lg p-3 cursor-pointer transition-all hover:scale-105 ${getStatusColor(job.status)}`}
                    onClick={() => onJobClick(job)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(job.status)}
                      <span className="text-white text-sm font-medium truncate flex-1">
                        {job.name}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 mb-2">
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
                          className="p-1.5 bg-zinc-800 hover:bg-orange-500 rounded transition-colors"
                          title="Retry job"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}

                      {job.status === 'failed' && onRetryJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryJob(job);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-orange-500 rounded transition-colors"
                          title="Retry job"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}

                      {job.status === 'running' && onCancelJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelJob(job);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-red-500 rounded transition-colors"
                          title="Cancel job"
                        >
                          <Ban className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}

                      {job.status === 'pending' && onCancelJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelJob(job);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-red-500 rounded transition-colors"
                          title="Cancel job"
                        >
                          <Ban className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}

                      {job.status === 'manual' && onRetryJob && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryJob(job);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-green-500 rounded transition-colors"
                          title="Run job"
                        >
                          <Play className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}

                      {onViewLogs && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewLogs(job);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-blue-500 rounded transition-colors"
                          title="View logs"
                        >
                          <FileText className="w-3.5 h-3.5 text-white" />
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
                <div className="w-8 h-0.5 bg-zinc-700"></div>
                <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-zinc-700"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
