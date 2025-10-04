'use client';

import { Pipeline } from '@/lib/gitlab-api';
import { getStatusColor, getStatusIcon, formatRelativeTime, formatDuration } from '@/lib/utils';
import { ExternalLink, RotateCw, X, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface PipelineCardProps {
  pipeline: Pipeline;
  projectName?: string;
  onClick?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  index?: number;
}

export default function PipelineCard({ pipeline, projectName, onClick, onRetry, onCancel, index }: PipelineCardProps) {
  const { theme, textPrimary, textSecondary, card } = useTheme();

  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 transition-all cursor-pointer group ${card} ${
        theme === 'light'
          ? 'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
          : 'hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          {/* Build Number Badge */}
          {index !== undefined && (
            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
              index === 0 ? 'bg-orange-500/20 text-orange-500' :
              index === 1 ? 'bg-orange-500/15 text-orange-400' :
              index === 2 ? 'bg-orange-500/10 text-orange-300' :
              theme === 'light' ? 'bg-gray-100 text-gray-500' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {index + 1}
            </div>
          )}
          <div className={cn(
            'px-3 py-1 rounded-md border text-xs font-semibold uppercase flex items-center gap-1',
            getStatusColor(pipeline.status)
          )}>
            <span>{getStatusIcon(pipeline.status)}</span>
            <span>{pipeline.status}</span>
          </div>
          <div className="flex-1">
            <p className={`font-medium ${textPrimary}`}>#{pipeline.id}</p>
            {projectName && (
              <p className={`text-xs ${textSecondary}`}>{projectName}</p>
            )}
          </div>
        </div>
        <a
          href={pipeline.web_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`transition-colors ${
            theme === 'light' ? 'text-[#86868b] hover:text-[#1d1d1f]' : 'text-zinc-500 hover:text-white'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className={`w-3.5 h-3.5 ${textSecondary}`} />
          <span className={`text-sm font-mono px-2 py-0.5 rounded ${
            theme === 'light' ? 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7]' : 'bg-zinc-800 text-white'
          }`}>
            {pipeline.ref}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${textSecondary}`}>Commit:</span>
          <span className={`text-sm font-mono ${textSecondary}`}>
            {pipeline.sha.substring(0, 8)}
          </span>
        </div>
      </div>

      <div className={`flex items-center justify-between pt-3 border-t ${
        theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'
      }`}>
        <div className={`flex items-center gap-4 text-xs ${textSecondary}`}>
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
        <div className={`flex items-center gap-2 mt-3 pt-3 border-t ${
          theme === 'light' ? 'border-[#d2d2d7]' : 'border-zinc-800'
        }`}>
          {pipeline.user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pipeline.user.avatar_url}
              alt={pipeline.user.name}
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className={`text-xs ${textSecondary}`}>{pipeline.user.name}</span>
        </div>
      )}
    </div>
  );
}
