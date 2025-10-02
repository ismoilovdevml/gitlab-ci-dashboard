'use client';

import { Settings, RefreshCw, Bell, Moon } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';

export default function SettingsTab() {
  const { autoRefresh, refreshInterval, setAutoRefresh, setRefreshInterval } = useDashboardStore();

  const refreshIntervals = [
    { value: 5000, label: '5 seconds' },
    { value: 10000, label: '10 seconds' },
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
  ];

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
                value={process.env.NEXT_PUBLIC_GITLAB_URL || 'https://gitlab.com'}
                disabled
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400 block mb-2">API Token</label>
              <input
                type="password"
                value="••••••••••••••••"
                disabled
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-500 cursor-not-allowed"
              />
              <p className="text-xs text-zinc-600 mt-2">
                Token is configured via environment variables
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
                <button className="px-4 py-2 bg-zinc-800 border border-orange-500 rounded-lg text-white font-medium">
                  Dark
                </button>
                <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-500 cursor-not-allowed">
                  Light (Soon)
                </button>
              </div>
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
