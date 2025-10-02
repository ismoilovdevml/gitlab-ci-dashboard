'use client';

import { Pipeline } from '@/lib/gitlab-api';
import { getStatusColor, getStatusIcon, formatRelativeTime, formatDuration } from '@/lib/utils';
import { ExternalLink, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineCardProps {
  pipeline: Pipeline;
  projectName?: string;
  onClick?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
}

export default function PipelineCard({ pipeline, projectName, onClick, onRetry, onCancel }: PipelineCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1">
          <div className={cn(
            'px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1',
            getStatusColor(pipeline.status)
          )}>
            <span>{getStatusIcon(pipeline.status)}</span>
            <span>{pipeline.status}</span>
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">#{pipeline.id}</p>
            {projectName && (
              <p className="text-xs text-zinc-500">{projectName}</p>
            )}
          </div>
        </div>
        <a
          href={pipeline.web_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-white transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">Branch:</span>
          <span className="text-white text-sm font-mono bg-zinc-800 px-2 py-0.5 rounded">
            {pipeline.ref}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">Commit:</span>
          <span className="text-zinc-300 text-sm font-mono">
            {pipeline.sha.substring(0, 8)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{formatRelativeTime(pipeline.updated_at)}</span>
          {pipeline.duration && (
            <>
              <span>•</span>
              <span>{formatDuration(pipeline.duration)}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pipeline.status === 'failed' && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="p-1.5 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
              title="Retry pipeline"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
          {(pipeline.status === 'running' || pipeline.status === 'pending') && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="p-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              title="Cancel pipeline"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {pipeline.user && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
          {pipeline.user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pipeline.user.avatar_url}
              alt={pipeline.user.name}
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className="text-xs text-zinc-400">{pipeline.user.name}</span>
        </div>
      )}
    </div>
  );
}
