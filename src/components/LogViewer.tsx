'use client';

import { useEffect, useState } from 'react';
import { X, Download, Maximize2 } from 'lucide-react';

interface LogViewerProps {
  logs: string;
  jobName: string;
  onClose: () => void;
}

export default function LogViewer({ logs, jobName, onClose }: LogViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col ${
        isFullscreen ? 'w-full h-full' : 'w-full max-w-6xl h-[80vh]'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-white font-semibold">Logs: {jobName}</h2>
          <div className="flex items-center gap-2">
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

        <div className="flex-1 overflow-auto p-4 bg-black">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
            {logs || 'No logs available'}
          </pre>
        </div>
      </div>
    </div>
  );
}
