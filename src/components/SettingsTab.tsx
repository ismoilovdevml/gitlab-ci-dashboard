'use client';

import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Bell, Moon, Sun, Eye, EyeOff, Save, Lock, LogOut, Key, Info } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function SettingsTab() {
  const router = useRouter();
  const {
    theme: currentTheme,
    setTheme,
    setAutoRefresh: setStoreAutoRefresh,
    setRefreshInterval: setStoreRefreshInterval,
    setNotifyPipelineFailures: setStoreNotifyPipelineFailures,
    setNotifyPipelineSuccess: setStoreNotifyPipelineSuccess,
  } = useDashboardStore();

  // State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10000);
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  const [gitlabToken, setGitlabToken] = useState('');
  const [notifyPipelineFailures, setNotifyPipelineFailures] = useState(true);
  const [notifyPipelineSuccess, setNotifyPipelineSuccess] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [appVersion, setAppVersion] = useState('');

  const { notifySuccess, notifyError, notifyInfo } = useNotifications();
  const { theme, card, textPrimary, textSecondary } = useTheme();

  const [showToken, setShowToken] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [localUrl, setLocalUrl] = useState(gitlabUrl);
  const [localToken, setLocalToken] = useState(gitlabToken);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>('');

  // Load user config on mount
  useEffect(() => {
    loadUserConfig();
    loadVersionInfo();
    loadCSRFToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCSRFToken = async () => {
    try {
      const response = await axios.get('/api/csrf');
      if (response.data && response.data.csrfToken) {
        setCsrfToken(response.data.csrfToken);
      }
    } catch (error) {
      console.error('Failed to load CSRF token:', error);
    }
  };

  const loadUserConfig = async () => {
    try {
      const response = await axios.get('/api/auth/session');
      if (response.data.authenticated && response.data.user) {
        const user = response.data.user;

        setUsername(user.username || '');
        setRole(user.role || '');

        const url = user.gitlabUrl || 'https://gitlab.com';
        const token = user.gitlabToken === '***' ? '' : user.gitlabToken || '';

        setGitlabUrl(url);
        setGitlabToken(token);
        setLocalUrl(url);
        setLocalToken(token);
        setAutoRefresh(user.autoRefresh ?? true);
        setRefreshInterval(user.refreshInterval ?? 10000);
        setNotifyPipelineFailures(user.notifyPipelineFailures ?? true);
        setNotifyPipelineSuccess(user.notifyPipelineSuccess ?? false);

        setStoreAutoRefresh(user.autoRefresh ?? true);
        setStoreRefreshInterval(user.refreshInterval ?? 10000);
        setStoreNotifyPipelineFailures(user.notifyPipelineFailures ?? true);
        setStoreNotifyPipelineSuccess(user.notifyPipelineSuccess ?? false);
      }
    } catch (error) {
      console.error('Failed to load user config:', error);
    }
  };

  const loadVersionInfo = async () => {
    try {
      const response = await axios.get('/api/version');
      if (response.data) {
        setAppVersion(response.data.currentVersion || '1.2.0');
      }
    } catch (error) {
      console.error('Failed to load version:', error);
      setAppVersion('1.2.0');
    }
  };

  const refreshIntervals = [
    { value: 5000, label: '5s' },
    { value: 10000, label: '10s' },
    { value: 30000, label: '30s' },
    { value: 60000, label: '1m' },
    { value: 300000, label: '5m' },
  ];

  const testGitLabConnection = async () => {
    setTesting(true);
    try {
      const response = await axios.get(`${localUrl}/api/v4/user`, {
        headers: { 'PRIVATE-TOKEN': localToken },
      });

      if (response.status === 200) {
        notifySuccess('GitLab Connected', `Connected as ${response.data.name || response.data.username}`);
        return true;
      }
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          notifyError('Connection Failed', 'Invalid API token');
        } else if (error.code === 'ERR_NETWORK') {
          notifyError('Connection Failed', 'Cannot reach GitLab server');
        } else {
          notifyError('Connection Failed', error.message || 'Unknown error');
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
      try {
        await axios.post('/api/config', {
          url: localUrl,
          token: localToken,
          autoRefresh,
          refreshInterval,
          theme: currentTheme,
          notifyPipelineFailures,
          notifyPipelineSuccess,
        }, {
          headers: {
            'x-csrf-token': csrfToken,
          },
        });

        setGitlabUrl(localUrl);
        setGitlabToken(localToken);

        setStoreAutoRefresh(autoRefresh);
        setStoreRefreshInterval(refreshInterval);
        setStoreNotifyPipelineFailures(notifyPipelineFailures);
        setStoreNotifyPipelineSuccess(notifyPipelineSuccess);

        setSaved(true);
        notifySuccess('Configuration Saved', 'Settings saved successfully');

        // Give time for user preferences hook to save to database
        setTimeout(() => {
          setSaved(false);
          window.location.reload();
        }, 2000); // Increased from 1500ms to 2000ms
      } catch (error) {
        if (axios.isAxiosError(error)) {
          notifyError('Save Failed', error.response?.data?.error || 'Could not save configuration');
        } else {
          notifyError('Save Failed', 'Could not save configuration');
        }
      }
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      notifyError('Validation Error', 'All password fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      notifyError('Validation Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      notifyError('Validation Error', 'Password must be at least 8 characters');
      return;
    }

    setChangingPassword(true);
    try {
      const response = await axios.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });

      if (response.data.success) {
        notifySuccess('Password Changed', 'Your password has been updated');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        notifyError('Change Failed', 'Current password is incorrect');
      } else {
        notifyError('Change Failed', 'Could not change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    notifyInfo('Theme Changed', `Switched to ${newTheme} theme`);
  };

  const handleAutoRefreshToggle = () => {
    const newValue = !autoRefresh;
    setAutoRefresh(newValue);
    setStoreAutoRefresh(newValue); // Save to Zustand store (will trigger database save)
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
      setStoreNotifyPipelineFailures(newValue); // Save to Zustand store (will trigger database save)
    } else {
      const newValue = !notifyPipelineSuccess;
      setNotifyPipelineSuccess(newValue);
      setStoreNotifyPipelineSuccess(newValue); // Save to Zustand store (will trigger database save)
    }
  };

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Settings</h1>
        <div className="flex items-center gap-3">
          <span className={`text-sm ${textSecondary}`}>{username}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            role === 'admin'
              ? 'bg-orange-500/10 text-orange-500'
              : 'bg-blue-500/10 text-blue-500'
          }`}>
            {role.toUpperCase()}
          </span>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
              theme === 'light'
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-red-950 text-red-400 hover:bg-red-900'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column */}
        <div className="space-y-5">
          {/* GitLab Configuration */}
          <div className={`rounded-lg p-5 ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-orange-500" />
              <h3 className={`text-base font-semibold ${textPrimary}`}>GitLab Configuration</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`text-xs ${textSecondary} mb-1.5 block`}>GitLab URL</label>
                <input
                  type="text"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  placeholder="https://gitlab.com"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    theme === 'light'
                      ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                      : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                  } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                />
              </div>
              <div>
                <label className={`text-xs ${textSecondary} mb-1.5 block`}>Access Token</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={localToken}
                    onChange={(e) => setLocalToken(e.target.value)}
                    placeholder="glpat-xxxxxxxxxxxxx"
                    className={`w-full px-3 py-2 pr-9 rounded-lg border font-mono text-sm ${
                      theme === 'light'
                        ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                        : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                    } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 ${textSecondary}`}
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleSaveGitLabConfig}
                disabled={!localUrl || !localToken || testing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all text-sm font-medium ${
                  (!localUrl || !localToken || testing) && 'opacity-50 cursor-not-allowed'
                }`}
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Testing...
                  </>
                ) : saved ? (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Test & Save
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div className={`rounded-lg p-5 ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-red-500" />
              <h3 className={`text-base font-semibold ${textPrimary}`}>Change Password</h3>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className={`w-full px-3 py-2 pr-9 rounded-lg border text-sm ${
                    theme === 'light'
                      ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                      : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                  } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                />
                <button
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 ${textSecondary}`}
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 characters)"
                  className={`w-full px-3 py-2 pr-9 rounded-lg border text-sm ${
                    theme === 'light'
                      ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                      : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                  } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                />
                <button
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 ${textSecondary}`}
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  theme === 'light'
                    ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                    : 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
              />
              <button
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all text-sm font-medium ${
                  (changingPassword || !currentPassword || !newPassword || !confirmPassword) && 'opacity-50 cursor-not-allowed'
                }`}
              >
                {changingPassword ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    Change Password
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Preferences */}
          <div className={`rounded-lg p-5 ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-blue-500" />
              <h3 className={`text-base font-semibold ${textPrimary}`}>Preferences</h3>
            </div>
            <div className="space-y-4">
              {/* Theme */}
              <div>
                <label className={`text-xs ${textSecondary} mb-2 block`}>Theme</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      currentTheme === 'dark'
                        ? 'bg-orange-500 text-white border-orange-500'
                        : theme === 'light'
                        ? 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 inline mr-1.5" />
                    Dark
                  </button>
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      currentTheme === 'light'
                        ? 'bg-orange-500 text-white border-orange-500'
                        : theme === 'light'
                        ? 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 inline mr-1.5" />
                    Light
                  </button>
                </div>
              </div>

              {/* Auto Refresh */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs ${textSecondary}`}>Auto Refresh</label>
                  <button
                    onClick={handleAutoRefreshToggle}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      autoRefresh ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        autoRefresh ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {autoRefresh && (
                  <select
                    value={refreshInterval}
                    onChange={(e) => {
                      const newValue = Number(e.target.value);
                      setRefreshInterval(newValue);
                      setStoreRefreshInterval(newValue); // Save to Zustand store (will trigger database save)
                    }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      theme === 'light'
                        ? 'bg-white border-gray-200 text-gray-900'
                        : 'bg-zinc-900 border-zinc-700 text-white'
                    } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                  >
                    {refreshIntervals.map((interval) => (
                      <option key={interval.value} value={interval.value}>
                        {interval.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className={`rounded-lg p-5 ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-green-500" />
              <h3 className={`text-base font-semibold ${textPrimary}`}>Notifications</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${textPrimary}`}>Pipeline Failures</p>
                  <p className={`text-xs ${textSecondary}`}>Get notified when pipelines fail</p>
                </div>
                <button
                  onClick={() => handleNotificationToggle('failure')}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    notifyPipelineFailures ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      notifyPipelineFailures ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${textPrimary}`}>Pipeline Success</p>
                  <p className={`text-xs ${textSecondary}`}>Get notified when pipelines succeed</p>
                </div>
                <button
                  onClick={() => handleNotificationToggle('success')}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    notifyPipelineSuccess ? 'bg-orange-500' : theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      notifyPipelineSuccess ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* About */}
          <div className={`rounded-lg p-5 ${card}`}>
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-purple-500" />
              <h3 className={`text-base font-semibold ${textPrimary}`}>About</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${textSecondary}`}>Product</span>
                <span className={`text-sm font-medium ${textPrimary}`}>GitLab CI/CD Dashboard</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${textSecondary}`}>Version</span>
                <span className={`text-sm font-medium ${textPrimary}`}>v{appVersion}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
