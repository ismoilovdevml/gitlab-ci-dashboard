'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Download, Maximize2, Search } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { type LogFilterLevel, lineMatches, parseJobLogCached } from '@/lib/log-parser';
import JobLogContent from './JobLogContent';

interface LogViewerProps {
  logs: string;
  jobName: string;
  jobStatus?: string;
  projectId?: number;
  jobId?: number;
  onClose: () => void;
  onRefreshLogs?: () => Promise<void>;
}

export default function LogViewer({
  logs,
  jobName,
  jobStatus,
  onClose,
  onRefreshLogs
}: LogViewerProps) {
  const { theme, textPrimary, textSecondary } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<LogFilterLevel>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const isLive = jobStatus === 'running';

  // Auto-refresh for running jobs
  useEffect(() => {
    if (isLive && onRefreshLogs) {
      const interval = setInterval(() => {
        onRefreshLogs();
      }, 3000); // Refresh every 3 seconds

      return () => clearInterval(interval);
    }

    return undefined;
  }, [isLive, onRefreshLogs]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parsed = useMemo(() => parseJobLogCached(logs), [logs]);
  const lowerTerm = searchTerm.trim().toLowerCase();
  const { matchCount, errorCount, warningCount } = useMemo(() => {
    let matches = 0;
    let errors = 0;
    let warnings = 0;
    for (const line of parsed.lines) {
      if (line.level === 'error') errors += 1;
      else if (line.level === 'warning') warnings += 1;
      if (lineMatches(line, lowerTerm, filterLevel)) matches += 1;
    }
    return { matchCount: matches, errorCount: errors, warningCount: warnings };
  }, [parsed, lowerTerm, filterLevel]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-1000 backdrop-blur-xs ${
          theme === 'light' ? 'bg-black/50' : 'bg-black/80'
        }`}
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 pointer-events-none">
        <div className={`rounded-xl flex flex-col pointer-events-auto ${
          isFullscreen ? 'w-full h-full' : 'w-full max-w-7xl h-[85vh]'
        } ${
          theme === 'light' ? 'bg-white border border-[#d2d2d7] shadow-2xl' : 'bg-zinc-900 border border-zinc-800'
        }`}>
          {/* Header */}
        <div className={`p-4 border-b ${theme === 'light' ? 'border-[#d2d2d7]/50' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className={`font-semibold text-lg ${textPrimary}`}>Job Logs: {jobName}</h2>
                {isLive && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    <span className="text-blue-400 text-xs font-medium">LIVE</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs">
                <span className={textSecondary}>
                  {matchCount} / {parsed.lines.length} lines
                </span>
                {errorCount > 0 && (
                  <span className="text-red-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    {errorCount} errors
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="text-yellow-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                    {warningCount} warnings
                  </span>
                )}
                {isLive && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    Auto-refresh (3s)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isLive && (
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    autoScroll
                      ? 'bg-blue-500 text-white'
                      : theme === 'light'
                      ? 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title="Auto-scroll to bottom"
                >
                  {autoScroll ? '📌 Auto-scroll ON' : '📌 Auto-scroll OFF'}
                </button>
              )}
              <button
                onClick={downloadLogs}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
                title="Download logs"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
                title="Toggle fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
              <input
                type="text"
                placeholder="Search in logs..."
                aria-label="Search in logs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-hidden focus:border-orange-500 ${
                  theme === 'light'
                    ? 'bg-[#f5f5f7] border-[#d2d2d7] text-[#1d1d1f] placeholder-[#86868b]'
                    : 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500'
                }`}
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterLevel('all')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterLevel === 'all'
                    ? 'bg-orange-500 text-white'
                    : theme === 'light'
                    ? 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterLevel('error')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterLevel === 'error'
                    ? 'bg-red-500 text-white'
                    : theme === 'light'
                    ? 'bg-[#f5f5f7] text-red-500 hover:bg-red-50'
                    : 'bg-zinc-800 text-red-400 hover:bg-red-500/20'
                }`}
              >
                Errors
              </button>
              <button
                onClick={() => setFilterLevel('warning')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterLevel === 'warning'
                    ? 'bg-yellow-500 text-white'
                    : theme === 'light'
                    ? 'bg-[#f5f5f7] text-yellow-600 hover:bg-yellow-50'
                    : 'bg-zinc-800 text-yellow-400 hover:bg-yellow-500/20'
                }`}
              >
                Warnings
              </button>
              <button
                onClick={() => setFilterLevel('info')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterLevel === 'info'
                    ? 'bg-blue-500 text-white'
                    : theme === 'light'
                    ? 'bg-[#f5f5f7] text-blue-600 hover:bg-blue-50'
                    : 'bg-zinc-800 text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                Info
              </button>
            </div>
          </div>
        </div>

        {/* Log Content */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl">
          <JobLogContent
            id="log-container"
            log={parsed}
            searchTerm={searchTerm}
            filterLevel={filterLevel}
            follow={isLive && autoScroll}
          />
        </div>
        </div>
      </div>
    </>
  );
}
