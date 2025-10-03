'use client';

import { useState } from 'react';
import { Settings, RefreshCw, Bell, Moon, Eye, EyeOff, Save, AlertCircle, Zap, Trash2, Download, Upload } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
import { getCache, invalidateCache } from '@/lib/gitlab-api';
import axios from 'axios';

export default function SettingsTab() {
  const {
    autoRefresh,
    refreshInterval,
    gitlabUrl,
    gitlabToken,
    theme: currentTheme,
    notifyPipelineFailures,
    notifyPipelineSuccess,
    setAutoRefresh,
    setRefreshInterval,
    setGitlabUrl,
    setGitlabToken,
    setTheme,
    setNotifyPipelineFailures,
    setNotifyPipelineSuccess,
  } = useDashboardStore();

  const { notifySuccess, notifyError, notifyInfo } = useNotifications();
  const { theme, card, textPrimary, textSecondary } = useTheme();

  const [showToken, setShowToken] = useState(false);
  const [localUrl, setLocalUrl] = useState(gitlabUrl);
  const [localToken, setLocalToken] = useState(gitlabToken);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cacheStats, setCacheStats] = useState({ size: 0, entries: 0 });

  const refreshIntervals = [
    { value: 5000, label: '5 seconds' },
    { value: 10000, label: '10 seconds' },
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
    { value: 300000, label: '5 minutes' },
  ];

  const updateCacheStats = () => {
    const cache = getCache();
    const stats = cache.getStats();
    setCacheStats({
      size: stats.size,
      entries: stats.entries.length
    });
  };

  const handleClearCache = () => {
    invalidateCache();
    updateCacheStats();
    notifySuccess('Cache Cleared', 'All cached data has been removed');
  };

  const handleExportSettings = () => {
    const settings = {
      gitlabUrl,
      autoRefresh,
      refreshInterval,
      theme: currentTheme,
      notifyPipelineFailures,
      notifyPipelineSuccess,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitlab-dashboard-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notifySuccess('Settings Exported', 'Downloaded settings file');
  };

  const handleImportSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);

        if (settings.gitlabUrl) setLocalUrl(settings.gitlabUrl);
        if (typeof settings.autoRefresh === 'boolean') setAutoRefresh(settings.autoRefresh);
        if (settings.refreshInterval) setRefreshInterval(settings.refreshInterval);
        if (settings.theme) setTheme(settings.theme);
        if (typeof settings.notifyPipelineFailures === 'boolean') setNotifyPipelineFailures(settings.notifyPipelineFailures);
        if (typeof settings.notifyPipelineSuccess === 'boolean') setNotifyPipelineSuccess(settings.notifyPipelineSuccess);

        notifySuccess('Settings Imported', 'Applied settings from file');
      } catch (error) {
        notifyError('Import Failed', 'Invalid settings file');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const testGitLabConnection = async () => {
    setTesting(true);
    try {
      const response = await axios.get(`${localUrl}/api/v4/user`, {
        headers: {
          'PRIVATE-TOKEN': localToken,
        },
      });

      if (response.status === 200) {
        notifySuccess('GitLab Connected', `Successfully connected as ${response.data.name || response.data.username}`);
        return true;
      }
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          notifyError('Connection Failed', 'Invalid API token. Please check your credentials.');
        } else if (error.code === 'ERR_NETWORK') {
          notifyError('Connection Failed', 'Cannot reach GitLab server. Check the URL.');
        } else {
          notifyError('Connection Failed', error.message || 'Unknown error occurred');
        }
      } else {
        notifyError('Connection Failed', 'Failed to connect to GitLab');
      }
      return false;
    } finally {
      setTesting(false);
    }
  };

  const handleSaveGitLabConfig = async () => {
    const isConnected = await testGitLabConnection();

    if (isConnected) {
      setGitlabUrl(localUrl);
      setGitlabToken(localToken);
      setSaved(true);

      setTimeout(() => {
        setSaved(false);
        window.location.reload();
      }, 1500);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    notifyInfo('Theme Changed', `Switched to ${newTheme} theme`);
  };

  const handleAutoRefreshToggle = () => {
    const newValue = !autoRefresh;
    setAutoRefresh(newValue);
    if (newValue) {
      notifySuccess('Auto Refresh Enabled', 'Dashboard will refresh automatically');
    } else {
      notifyInfo('Auto Refresh Disabled', 'Dashboard refresh paused');
    }
  };

  const handleNotificationToggle = (type: 'failure' | 'success') => {
    if (type === 'failure') {
      const newValue = !notifyPipelineFailures;
      setNotifyPipelineFailures(newValue);
      if (newValue) {
        notifySuccess('Notifications Enabled', 'You will be notified of pipeline failures');
      } else {
        notifyInfo('Notifications Disabled', 'Pipeline failure notifications turned off');
      }
    } else {
      const newValue = !notifyPipelineSuccess;
      setNotifyPipelineSuccess(newValue);
      if (newValue) {
        notifySuccess('Notifications Enabled', 'You will be notified of pipeline successes');
      } else {
        notifyInfo('Notifications Disabled', 'Pipeline success notifications turned off');
      }
    }
  };

  // Update cache stats on mount
  useState(() => {
    updateCacheStats();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Settings</h1>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".json" onChange={handleImportSettings} className="hidden" />
            <div className={`px-3 py-1.5 text-sm rounded-lg border ${
              theme === 'light' ? 'border-gray-300 bg-white hover:bg-gray-50' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
            } ${textPrimary} flex items-center gap-1.5 transition-colors`}>
              <Upload className="w-3.5 h-3.5" />
              Import
            </div>
          </label>
          <button onClick={handleExportSettings} className={`px-3 py-1.5 text-sm rounded-lg border ${
            theme === 'light' ? 'border-gray-300 bg-white hover:bg-gray-50' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
          } ${textPrimary} flex items-center gap-1.5 transition-colors`}>
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* GitLab Configuration */}
        <div className={`rounded-lg p-4 ${card} border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-orange-500" />
            <h3 className={`font-semibold text-sm ${textPrimary}`}>GitLab</h3>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="https://gitlab.com"
              className={`w-full px-3 py-2 text-sm rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                theme === 'light' ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
              }`}
            />
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxxx"
                className={`w-full px-3 py-2 pr-9 text-sm rounded-lg border font-mono transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                  theme === 'light' ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                }`}
              />
              <button onClick={() => setShowToken(!showToken)} className={`absolute right-2 top-1/2 -translate-y-1/2 ${
                theme === 'light' ? 'text-gray-500 hover:text-gray-900' : 'text-zinc-500 hover:text-white'
              }`}>
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button onClick={handleSaveGitLabConfig} disabled={!localUrl || !localToken || testing} className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium ${
              (!localUrl || !localToken || testing) && 'opacity-50 cursor-not-allowed'
            }`}>
              {testing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Testing...</> : saved ? <><AlertCircle className="w-3.5 h-3.5" />Saved!</> : <><Save className="w-3.5 h-3.5" />Save</>}
            </button>
          </div>
        </div>

        {/* Auto Refresh */}
        <div className={`rounded-lg p-4 ${card} border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            <h3 className={`font-semibold text-sm ${textPrimary}`}>Auto Refresh</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>Enable</span>
              <button onClick={handleAutoRefreshToggle} className={`relative w-11 h-6 rounded-full transition-colors ${
                autoRefresh ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
              }`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoRefresh ? 'transform translate-x-5' : ''}`} />
              </button>
            </div>
            {autoRefresh && (
              <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} className={`w-full px-3 py-2 text-sm rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                theme === 'light' ? 'bg-white border-gray-300 text-gray-900' : 'bg-zinc-900 border-zinc-700 text-white'
              }`}>
                {refreshIntervals.map((interval) => (
                  <option key={interval.value} value={interval.value}>{interval.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className={`rounded-lg p-4 ${card} border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-green-500" />
            <h3 className={`font-semibold text-sm ${textPrimary}`}>Notifications</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>Failures</span>
              <button onClick={() => handleNotificationToggle('failure')} className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyPipelineFailures ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
              }`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notifyPipelineFailures ? 'transform translate-x-5' : ''}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>Success</span>
              <button onClick={() => handleNotificationToggle('success')} className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyPipelineSuccess ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
              }`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notifyPipelineSuccess ? 'transform translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className={`rounded-lg p-4 ${card} border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Moon className="w-4 h-4 text-purple-500" />
            <h3 className={`font-semibold text-sm ${textPrimary}`}>Theme</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleThemeChange('dark')} className={`px-3 py-2 text-sm border-2 rounded-lg font-medium transition-all ${
              currentTheme === 'dark' ? 'border-orange-500 bg-orange-500/10 text-orange-500' : theme === 'light' ? 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
            }`}>🌙 Dark</button>
            <button onClick={() => handleThemeChange('light')} className={`px-3 py-2 text-sm border-2 rounded-lg font-medium transition-all ${
              currentTheme === 'light' ? 'border-orange-500 bg-orange-500/10 text-orange-500' : theme === 'light' ? 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
            }`}>☀️ Light</button>
          </div>
        </div>

        {/* Performance */}
        <div className={`rounded-lg p-4 ${card} border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-yellow-500" />
            <h3 className={`font-semibold text-sm ${textPrimary}`}>Performance</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>API Mode</span>
              <span className="text-xs font-medium text-green-500">UNLIMITED</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>Cache</span>
              <span className={`text-xs font-medium ${textPrimary}`}>{cacheStats.entries} entries</span>
            </div>
            <button onClick={handleClearCache} className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              theme === 'light' ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-900 bg-red-950 text-red-400 hover:bg-red-900'
            }`}>
              <Trash2 className="w-3.5 h-3.5" />
              Clear Cache
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
