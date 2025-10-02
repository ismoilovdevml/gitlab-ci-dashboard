'use client';

import { useEffect, useState } from 'react';
import { X, Download, Maximize2, Search } from 'lucide-react';

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warning' | 'info'>('all');
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
  }, [isLive, onRefreshLogs]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && isLive) {
      const logContainer = document.getElementById('log-container');
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll, isLive]);

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

  // Parse and colorize log lines
  const parseLogLine = (line: string) => {
    const lowerLine = line.toLowerCase();

    // Error patterns
    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('fatal') ||
        lowerLine.includes('exception') || lowerLine.includes('✗')) {
      return { level: 'error', color: 'text-red-400', bg: 'bg-red-500/10' };
    }

    // Warning patterns
    if (lowerLine.includes('warning') || lowerLine.includes('warn') || lowerLine.includes('deprecated') ||
        lowerLine.includes('⚠')) {
      return { level: 'warning', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    }

    // Success patterns
    if (lowerLine.includes('success') || lowerLine.includes('complete') || lowerLine.includes('✓') ||
        lowerLine.includes('done') || lowerLine.includes('passed') || line.includes('OK:')) {
      return { level: 'success', color: 'text-green-400', bg: 'bg-green-500/10' };
    }

    // Info/command patterns
    if (line.startsWith('$') || line.startsWith('>') || line.startsWith('#') ||
        lowerLine.includes('running') || lowerLine.includes('executing') || lowerLine.includes('step_script')) {
      return { level: 'info', color: 'text-blue-400', bg: 'bg-blue-500/10' };
    }

    // Section markers
    if (line.includes('section_start') || line.includes('section_end')) {
      return { level: 'section', color: 'text-purple-400', bg: 'bg-purple-500/10' };
    }

    // Default
    return { level: 'default', color: 'text-zinc-400', bg: '' };
  };

  // Filter and highlight logs
  const processLogs = () => {
    if (!logs) return [];

    const lines = logs.split('\n');
    return lines
      .map((line, index) => {
        const parsed = parseLogLine(line);
        return { line, index, ...parsed };
      })
      .filter(item => {
        // Filter by level
        if (filterLevel !== 'all' && item.level !== filterLevel) return false;

        // Filter by search term
        if (searchTerm && !item.line.toLowerCase().includes(searchTerm.toLowerCase())) return false;

        return true;
      });
  };

  const processedLogs = processLogs();
  const errorCount = logs.split('\n').filter(line => parseLogLine(line).level === 'error').length;
  const warningCount = logs.split('\n').filter(line => parseLogLine(line).level === 'warning').length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col ${
        isFullscreen ? 'w-full h-full' : 'w-full max-w-7xl h-[85vh]'
      }`}>
        {/* Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-white font-semibold text-lg">Job Logs: {jobName}</h2>
                {isLive && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    <span className="text-blue-400 text-xs font-medium">LIVE</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs">
                <span className="text-zinc-500">
                  {processedLogs.length} / {logs.split('\n').length} lines
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
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    autoScroll
                      ? 'bg-blue-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title="Auto-scroll to bottom"
                >
                  {autoScroll ? '📌 Auto-scroll ON' : '📌 Auto-scroll OFF'}
                </button>
              )}
              <button
                onClick={downloadLogs}
                className="p-2 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                title="Download logs"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                title="Toggle fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search in logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterLevel('all')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterLevel === 'all'
                    ? 'bg-orange-500 text-white'
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
                    : 'bg-zinc-800 text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                Info
              </button>
            </div>
          </div>
        </div>

        {/* Log Content */}
        <div id="log-container" className="flex-1 overflow-auto bg-black">
          {processedLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No logs match your filters
            </div>
          ) : (
            <div className="p-4 font-mono text-xs leading-relaxed">
              {processedLogs.map((item) => (
                <div
                  key={item.index}
                  className={`py-1 px-3 rounded mb-0.5 ${item.bg} hover:bg-zinc-800/50 transition-colors`}
                >
                  <span className="text-zinc-600 mr-3 select-none inline-block w-10 text-right">
                    {item.index + 1}
                  </span>
                  <span className={item.color}>
                    {searchTerm && item.line.toLowerCase().includes(searchTerm.toLowerCase()) ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: item.line.replace(
                            new RegExp(`(${searchTerm})`, 'gi'),
                            '<mark class="bg-yellow-500 text-black px-1 rounded">$1</mark>'
                          ),
                        }}
                      />
                    ) : (
                      item.line
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
