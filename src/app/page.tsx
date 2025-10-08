'use client';

import { useEffect, lazy, Suspense } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import NotificationToast from '@/components/NotificationToast';
import ApiRateLimitIndicator from '@/components/ApiRateLimitIndicator';
import { useDashboardStore } from '@/store/dashboard-store';
import { useConfigLoader } from '@/hooks/useConfigLoader';
// import { usePipelineAlerts } from '@/hooks/usePipelineAlerts'; // Disabled - using webhooks now

// Lazy load heavy components
const PipelinesTab = lazy(() => import('@/components/PipelinesTab'));
const ProjectsTab = lazy(() => import('@/components/ProjectsTab'));
const RunnersTab = lazy(() => import('@/components/RunnersTab'));
const AnalyticsTab = lazy(() => import('@/components/analytics/AnalyticsTab'));
const ArtifactsTab = lazy(() => import('@/components/ArtifactsTab'));
const ContainerRegistryTab = lazy(() => import('@/components/ContainerRegistryTab'));
const AlertingTab = lazy(() => import('@/components/AlertingTab'));
const SettingsTab = lazy(() => import('@/components/SettingsTab'));

export default function Home() {
  const { theme, activeTab, setActiveTab } = useDashboardStore();

  // Load config from database on mount (ALL PAGES)
  useConfigLoader();

  // Enable pipeline alerts monitoring (DISABLED - using webhooks now for instant alerts)
  // usePipelineAlerts();

  useEffect(() => {
    // Set theme attribute and class for proper styling
    document.documentElement.setAttribute('data-theme', theme);

    // Apply theme class to html element
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // const handleNavigate = (tab: string) => {
  //   setActiveTab(tab);
  // };

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'pipelines':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <PipelinesTab />
          </Suspense>
        );
      case 'projects':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <ProjectsTab />
          </Suspense>
        );
      case 'runners':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <RunnersTab />
          </Suspense>
        );
      case 'analytics':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <AnalyticsTab />
          </Suspense>
        );
      case 'artifacts':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <ArtifactsTab />
          </Suspense>
        );
      case 'registry':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <ContainerRegistryTab />
          </Suspense>
        );
      case 'alerting':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <AlertingTab />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <SettingsTab />
          </Suspense>
        );
      default:
        return <Overview />;
    }
  };

  return (
    <div className={`flex h-screen transition-colors duration-300 ${
      theme === 'light' ? 'bg-gray-50' : 'bg-zinc-950'
    }`}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          {renderContent()}
        </div>
      </main>
      <NotificationToast />
      <ApiRateLimitIndicator />
    </div>
  );
}
