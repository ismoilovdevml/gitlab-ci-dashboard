'use client';

import { useState } from 'react';
import { Settings, RefreshCw, Bell, Moon, Eye, EyeOff, Save, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
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
  const { theme, card, textPrimary, textSecondary, input, inputFocus } = useTheme();

  const [showToken, setShowToken] = useState(false);
  const [localUrl, setLocalUrl] = useState(gitlabUrl);
  const [localToken, setLocalToken] = useState(gitlabToken);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  const refreshIntervals = [
    { value: 5000, label: '5 seconds' },
    { value: 10000, label: '10 seconds' },
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
  ];

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
    // First test the connection
    const isConnected = await testGitLabConnection();

    if (isConnected) {
      setGitlabUrl(localUrl);
      setGitlabToken(localToken);
      setSaved(true);

      setTimeout(() => {
        setSaved(false);
        // Reload page to apply new config
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Settings</h1>
        <p className={textSecondary}>Configure dashboard preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auto Refresh */}
        <div className={`rounded-lg p-6 ${card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className={`font-semibold ${textPrimary}`}>Auto Refresh</h3>
              <p className={`text-xs ${textSecondary}`}>Automatically refresh dashboard data</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textSecondary}`}>Enable auto-refresh</span>
              <button
                onClick={handleAutoRefreshToggle}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  autoRefresh ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
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
                <label className={`text-sm block mb-2 ${textSecondary}`}>Refresh interval</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className={`w-full px-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
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
        <div className={`rounded-lg p-6 ${card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className={`font-semibold ${textPrimary}`}>GitLab Configuration</h3>
              <p className={`text-xs ${textSecondary}`}>Connection settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`text-sm block mb-2 ${textSecondary}`}>GitLab URL</label>
              <input
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="https://gitlab.com"
                className={`w-full px-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
              />
            </div>

            <div>
              <label className={`text-sm block mb-2 ${textSecondary}`}>API Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={localToken}
                  onChange={(e) => setLocalToken(e.target.value)}
                  placeholder="glpat-xxxxxxxxxxxxx"
                  className={`w-full px-4 py-2 pr-10 rounded-lg font-mono text-sm focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                    theme === 'light' ? 'text-gray-500 hover:text-gray-900' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveGitLabConfig}
              disabled={!localUrl || !localToken || testing}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium ${
                (!localUrl || !localToken || testing) && 'opacity-50 cursor-not-allowed'
              }`}
            >
              {testing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Testing Connection...
                </>
              ) : saved ? (
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

            <div className={`rounded-lg p-3 ${
              theme === 'light' ? 'bg-blue-50 border border-blue-200' : 'bg-blue-500/10 border border-blue-500/20'
            }`}>
              <p className={`text-xs ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>
                💡 <strong>Tip:</strong> Get your token from GitLab → Settings → Access Tokens with <code className={`px-1 rounded ${theme === 'light' ? 'bg-blue-100' : 'bg-blue-500/20'}`}>api</code> scope
              </p>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className={`rounded-lg p-6 ${card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Moon className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className={`font-semibold ${textPrimary}`}>Appearance</h3>
              <p className={`text-xs ${textSecondary}`}>Customize dashboard appearance</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`text-sm block mb-2 ${textSecondary}`}>Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`px-4 py-2 border rounded-lg font-medium transition-colors ${
                    currentTheme === 'dark'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : theme === 'light'
                      ? 'border-gray-300 bg-gray-100 text-gray-700 hover:text-gray-900'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-white'
                  }`}
                >
                  🌙 Dark
                </button>
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`px-4 py-2 border rounded-lg font-medium transition-colors ${
                    currentTheme === 'light'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : theme === 'light'
                      ? 'border-gray-300 bg-gray-100 text-gray-700 hover:text-gray-900'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-white'
                  }`}
                >
                  ☀️ Light
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className={`rounded-lg p-6 ${card}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className={`font-semibold ${textPrimary}`}>Notifications</h3>
              <p className={`text-xs ${textSecondary}`}>Manage alert preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textSecondary}`}>Pipeline failures</span>
              <button
                onClick={() => handleNotificationToggle('failure')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  notifyPipelineFailures ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    notifyPipelineFailures ? 'transform translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textSecondary}`}>Pipeline success</span>
              <button
                onClick={() => handleNotificationToggle('success')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  notifyPipelineSuccess ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    notifyPipelineSuccess ? 'transform translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
