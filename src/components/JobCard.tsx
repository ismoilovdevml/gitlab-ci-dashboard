'use client';

import { Job } from '@/lib/gitlab-api';
import { getStatusColor, getStatusIcon, formatDuration, formatRelativeTime } from '@/lib/utils';
import { ExternalLink, Play, RotateCw, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobCardProps {
  job: Job;
  onViewLogs?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  onPlay?: () => void;
}

export default function JobCard({ job, onViewLogs, onRetry, onCancel, onPlay }: JobCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1">
          <div className={cn(
            'px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1',
            getStatusColor(job.status)
          )}>
            <span>{getStatusIcon(job.status)}</span>
            <span>{job.status}</span>
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">{job.name}</p>
            <p className="text-xs text-zinc-500">Stage: {job.stage}</p>
          </div>
        </div>
        <a
          href={job.web_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {job.commit && (
        <div className="mb-3 p-3 bg-zinc-800/50 rounded-md">
          <p className="text-white text-sm mb-1">{job.commit.title}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="font-mono">{job.commit.short_id}</span>
            <span>•</span>
            <span>{job.commit.author_name}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          {job.started_at && <span>{formatRelativeTime(job.started_at)}</span>}
          {job.duration && (
            <>
              <span>•</span>
              <span>{formatDuration(job.duration)}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onViewLogs && (
            <button
              onClick={onViewLogs}
              className="p-1.5 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
              title="View logs"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {job.status === 'manual' && onPlay && (
            <button
              onClick={onPlay}
              className="p-1.5 rounded-md bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
              title="Play job"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          {job.status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
              title="Retry job"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
          {(job.status === 'running' || job.status === 'pending') && onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              title="Cancel job"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
