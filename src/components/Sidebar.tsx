'use client';

import { useEffect, useState } from 'react';
import { Activity, Boxes, GitBranch, Settings, PlayCircle, Package, FileArchive, BarChart3, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { theme, sidebar, sidebarItem, textPrimary, textMuted } = useTheme();
  const {  } = useDashboardStore();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

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

  const menuItems = [
    { id: 'overview', icon: Activity, label: 'Overview' },
    { id: 'pipelines', icon: GitBranch, label: 'Pipelines' },
    { id: 'projects', icon: Boxes, label: 'Projects' },
    { id: 'runners', icon: PlayCircle, label: 'Runners' },
    { id: 'insights', icon: BarChart3, label: 'Insights' },
    { id: 'artifacts', icon: FileArchive, label: 'Artifacts' },
    { id: 'registry', icon: Package, label: 'Registry' },
    { id: 'alerting', icon: Bell, label: 'Alerting' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className={`w-64 h-screen flex flex-col transition-colors ${sidebar}`}>
      <div className={`p-6 ${theme === 'light' ? 'border-b border-gray-200' : 'border-b border-zinc-800'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg">
            <GitBranch className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-bold ${textPrimary}`}>GitLab CI/CD</h1>
            <p className={`text-xs ${textMuted}`}>Enterprise Dashboard</p>
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

      <div className={`p-4 ${theme === 'light' ? 'border-t border-gray-200' : 'border-t border-zinc-800'}`}>
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
    </div>
  );
}
