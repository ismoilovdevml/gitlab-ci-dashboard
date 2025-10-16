'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Activity, Boxes, GitBranch, Settings, PlayCircle, Package, FileArchive, Bell, LogOut, User, Download, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import axios from 'axios';
import UpdateModal from './UpdateModal';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const router = useRouter();
  const { theme, sidebar, sidebarItem, textPrimary, textMuted } = useTheme();
  const {  } = useDashboardStore();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [versionInfo, setVersionInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    releaseUrl: string;
    releaseDate: string;
  } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Get user info on mount
  useEffect(() => {
    const getUserInfo = async () => {
      try {
        const response = await axios.get('/api/auth/session');
        if (response.data.authenticated && response.data.user) {
          setUsername(response.data.user.username);
          setUserRole(response.data.user.role);
        }
      } catch (error) {
        console.error('Failed to get user info:', error);
      }
    };

    getUserInfo();
  }, []);

  // Check for updates
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch('/api/version');
        const data = await response.json();
        setVersionInfo(data);
      } catch (error) {
        console.error('Failed to check version:', error);
      }
    };

    checkVersion();
    // Check every 6 hours
    const interval = setInterval(checkVersion, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkConnection = async () => {
      setIsChecking(true);
      try {
        const api = await getGitLabAPIAsync();
        const connected = await api.checkConnection(); // Direct API check, no cache
        setIsConnected(connected);
      } catch (error) {
        console.error('GitLab connection check failed:', error);
        setIsConnected(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkConnection();

    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const menuItems = [
    { id: 'overview', icon: Activity, label: 'Overview' },
    { id: 'pipelines', icon: GitBranch, label: 'Pipelines' },
    { id: 'projects', icon: Boxes, label: 'Projects' },
    { id: 'runners', icon: PlayCircle, label: 'Runners' },
    { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
    { id: 'artifacts', icon: FileArchive, label: 'Artifacts' },
    { id: 'registry', icon: Package, label: 'Registry' },
    { id: 'alerting', icon: Bell, label: 'Alerting' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className={`w-64 h-screen flex flex-col transition-colors ${sidebar}`}>
      <div className={`p-6 ${theme === 'light' ? 'border-b border-gray-200' : 'border-b border-zinc-800'}`}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center">
            <Image
              src="/gitlab-logo-500-rgb.svg"
              alt="GitLab"
              width={56}
              height={56}
              priority
            />
          </div>
          <div className="flex-1">
            <h1 className={`text-xl font-bold ${textPrimary}`}>GitLab CI/CD</h1>
            {versionInfo && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className={`text-xs ${textMuted}`}>v{versionInfo.currentVersion}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
                    activeTab === item.id
                      ? theme === 'light'
                        ? 'bg-orange-50 text-orange-600 shadow-sm'
                        : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                      : sidebarItem
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={`p-4 space-y-3 ${theme === 'light' ? 'border-t border-gray-200' : 'border-t border-zinc-800'}`}>
        {/* Version Info */}
        {versionInfo && (
          <button
            onClick={() => versionInfo.updateAvailable && setShowUpdateModal(true)}
            disabled={!versionInfo.updateAvailable}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
              versionInfo.updateAvailable
                ? theme === 'light'
                  ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer'
                  : 'bg-blue-950/30 hover:bg-blue-950/50 border border-blue-800/30 cursor-pointer'
                : theme === 'light'
                  ? 'bg-gray-50 border border-gray-200 cursor-default'
                  : 'bg-zinc-800/50 border border-zinc-800 cursor-default'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              versionInfo.updateAvailable
                ? theme === 'light' ? 'bg-blue-500' : 'bg-blue-600'
                : theme === 'light' ? 'bg-gray-400' : 'bg-zinc-700'
            }`}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className={`text-xs font-semibold ${
                versionInfo.updateAvailable
                  ? theme === 'light' ? 'text-blue-700' : 'text-blue-300'
                  : textPrimary
              }`}>
                {versionInfo.updateAvailable ? `v${versionInfo.latestVersion} ready` : `v${versionInfo.currentVersion}`}
              </p>
            </div>
            {versionInfo.updateAvailable && (
              <Download className={`w-4 h-4 ${
                theme === 'light' ? 'text-blue-600' : 'text-blue-400'
              }`} />
            )}
          </button>
        )}

        {/* User Info */}
        {username && (
          <div className={`flex items-center justify-between p-3 rounded-lg ${
            theme === 'light' ? 'bg-gray-50' : 'bg-zinc-800/50'
          }`}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                theme === 'light' ? 'bg-orange-100 text-orange-600' : 'bg-orange-500/10 text-orange-500'
              }`}>
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${textPrimary}`}>{username}</p>
                <p className={`text-xs ${textMuted}`}>{userRole}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className={`p-2 rounded-lg transition-all ${
                theme === 'light' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-red-950 text-red-400'
              }`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-xs ${
            isConnected === null ? textMuted :
            isConnected ? 'text-green-500' : 'text-red-500'
          }`}>
            <div className={cn(
              'w-2 h-2 rounded-full',
              isChecking && 'animate-pulse',
              isConnected === null ? 'bg-gray-400' :
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )}></div>
            <span className="font-medium">
              {isConnected === null ? 'Checking...' :
               isConnected ? 'Connected to GitLab' : 'Disconnected'}
            </span>
          </div>
        </div>
        {isConnected === false && (
          <p className={`text-[10px] mt-1 ${theme === 'light' ? 'text-red-600' : 'text-red-400'}`}>
            Check your GitLab URL and token
          </p>
        )}
      </div>

      {/* Update Modal */}
      {showUpdateModal && versionInfo && (
        <UpdateModal
          currentVersion={versionInfo.currentVersion}
          latestVersion={versionInfo.latestVersion}
          releaseUrl={versionInfo.releaseUrl}
          releaseDate={versionInfo.releaseDate}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
