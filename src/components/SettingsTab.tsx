'use client';

import { useState } from 'react';
import { Settings, RefreshCw, Bell, Moon, Eye, EyeOff, Save, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';

export default function SettingsTab() {
  const {
    autoRefresh,
    refreshInterval,
    gitlabUrl,
    gitlabToken,
    theme,
    setAutoRefresh,
    setRefreshInterval,
    setGitlabUrl,
    setGitlabToken,
    setTheme,
  } = useDashboardStore();

  const [showToken, setShowToken] = useState(false);
  const [localUrl, setLocalUrl] = useState(gitlabUrl);
  const [localToken, setLocalToken] = useState(gitlabToken);
  const [saved, setSaved] = useState(false);

  const refreshIntervals = [
    { value: 5000, label: '5 seconds' },
    { value: 10000, label: '10 seconds' },
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
  ];

  const handleSaveGitLabConfig = () => {
    setGitlabUrl(localUrl);
    setGitlabToken(localToken);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      // Reload page to apply new config
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-zinc-400">Configure dashboard preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auto Refresh */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Auto Refresh</h3>
              <p className="text-xs text-zinc-500">Automatically refresh dashboard data</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Enable auto-refresh</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  autoRefresh ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    autoRefresh ? 'transform translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {autoRefresh && (
              <div>
                <label className="text-sm text-zinc-400 block mb-2">Refresh interval</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {refreshIntervals.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* GitLab Configuration */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-white font-semibold">GitLab Configuration</h3>
              <p className="text-xs text-zinc-500">Connection settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-2">GitLab URL</label>
              <input
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="https://gitlab.com"
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 block mb-2">API Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={localToken}
                  onChange={(e) => setLocalToken(e.target.value)}
                  placeholder="glpat-xxxxxxxxxxxxx"
                  className="w-full px-4 py-2 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 font-mono text-sm"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveGitLabConfig}
              disabled={!localUrl || !localToken}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
            >
              {saved ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Saved! Reloading...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Configuration
                </>
              )}
            </button>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-400">
                💡 <strong>Tip:</strong> Get your token from GitLab → Settings → Access Tokens with <code className="bg-blue-500/20 px-1 rounded">api</code> scope
              </p>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Moon className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Appearance</h3>
              <p className="text-xs text-zinc-500">Customize dashboard appearance</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-4 py-2 bg-zinc-800 border rounded-lg font-medium transition-colors ${
                    theme === 'dark'
                      ? 'border-orange-500 text-white'
                      : 'border-zinc-700 text-zinc-500 hover:text-white'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`px-4 py-2 bg-zinc-800 border rounded-lg font-medium transition-colors ${
                    theme === 'light'
                      ? 'border-orange-500 text-white'
                      : 'border-zinc-700 text-zinc-500 hover:text-white'
                  }`}
                >
                  Light
                </button>
              </div>
              {theme === 'light' && (
                <p className="text-xs text-zinc-600 mt-2">
                  ⚠️ Light theme coming soon
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Notifications</h3>
              <p className="text-xs text-zinc-500">Manage alert preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Pipeline failures</span>
              <button className="relative w-12 h-6 rounded-full bg-zinc-700">
                <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Pipeline success</span>
              <button className="relative w-12 h-6 rounded-full bg-zinc-700">
                <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-4">
              Notification features coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
