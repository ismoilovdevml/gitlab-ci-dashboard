'use client';

import { X, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface UpdateModalProps {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseDate: string;
  onClose: () => void;
}

export default function UpdateModal({
  currentVersion,
  latestVersion,
  releaseUrl,
  releaseDate,
  onClose
}: UpdateModalProps) {
  const { theme, card, textPrimary, textSecondary } = useTheme();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
      theme === 'light' ? 'bg-black/40' : 'bg-black/70'
    }`}>
      <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl ${card}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'light' ? 'border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50' : 'border-zinc-800 bg-gradient-to-r from-blue-950/30 to-cyan-950/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              theme === 'light' ? 'bg-blue-500' : 'bg-blue-600'
            }`}>
              <Download className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>Update Available</h2>
              <p className={`text-sm ${textSecondary}`}>
                {currentVersion} → {latestVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'hover:bg-gray-200' : 'hover:bg-zinc-800'
            }`}
          >
            <X className={`w-5 h-5 ${textSecondary}`} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Release Info */}
          <div className={`mb-6 p-4 rounded-lg ${
            theme === 'light' ? 'bg-blue-50 border border-blue-200' : 'bg-blue-950/20 border border-blue-800/30'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${textPrimary}`}>
              Latest Release: v{latestVersion}
            </h3>
            <p className={`text-sm ${textSecondary}`}>{formatDate(releaseDate)}</p>
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 mt-3 text-sm font-medium ${
                theme === 'light' ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'
              }`}
            >
              View Release Notes on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* How to Update */}
          <div className="space-y-6">
            <h3 className={`text-lg font-semibold ${textPrimary} flex items-center gap-2`}>
              <span className="text-xl">›</span> How to Update
            </h3>

            {/* Docker Users */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  theme === 'light' ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-400'
                }`}>
                  <span className="text-sm">✓</span>
                </div>
                <h4 className={`font-semibold ${textPrimary}`}>Docker Users (Recommended)</h4>
              </div>
              <div className={`rounded-lg p-4 font-mono text-sm ${
                theme === 'light' ? 'bg-gray-900 text-green-400' : 'bg-black text-green-400'
              }`}>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Stop current containers</span>
                  </div>
                  <div className="text-green-400">docker-compose down</div>

                  <div className="flex items-start gap-2 mt-3">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Pull latest image</span>
                  </div>
                  <div className="text-green-400">docker-compose pull app</div>

                  <div className="flex items-start gap-2 mt-3">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Start with new version</span>
                  </div>
                  <div className="text-green-400">docker-compose up -d</div>
                </div>
              </div>
            </div>

            {/* Local Development */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  theme === 'light' ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                }`}>
                  <span className="text-sm">✓</span>
                </div>
                <h4 className={`font-semibold ${textPrimary}`}>Local Development</h4>
              </div>
              <div className={`rounded-lg p-4 font-mono text-sm ${
                theme === 'light' ? 'bg-gray-900 text-green-400' : 'bg-black text-green-400'
              }`}>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Pull latest code</span>
                  </div>
                  <div className="text-green-400">git pull origin main</div>

                  <div className="flex items-start gap-2 mt-3">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Install dependencies</span>
                  </div>
                  <div className="text-green-400">npm install</div>

                  <div className="flex items-start gap-2 mt-3">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Rebuild</span>
                  </div>
                  <div className="text-green-400">npm run build</div>

                  <div className="flex items-start gap-2 mt-3">
                    <span className="text-gray-500">#</span>
                    <span className="text-gray-400">Restart</span>
                  </div>
                  <div className="text-green-400">npm start</div>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className={`flex items-start gap-3 p-4 rounded-lg ${
              theme === 'light' ? 'bg-yellow-50 border border-yellow-200' : 'bg-yellow-900/20 border border-yellow-800/30'
            }`}>
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                theme === 'light' ? 'text-yellow-600' : 'text-yellow-500'
              }`} />
              <div>
                <h4 className={`font-semibold mb-1 ${
                  theme === 'light' ? 'text-yellow-900' : 'text-yellow-400'
                }`}>
                  Before Updating
                </h4>
                <p className={`text-sm ${
                  theme === 'light' ? 'text-yellow-800' : 'text-yellow-300/90'
                }`}>
                  It's recommended to backup your database before updating. All data will be preserved, but it's always safer to have a backup.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${
          theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/50'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              theme === 'light'
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
            }`}
          >
            Close
          </button>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            View on GitHub
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
