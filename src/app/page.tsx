'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import PipelinesTab from '@/components/PipelinesTab';
import ProjectsTab from '@/components/ProjectsTab';
import RunnersTab from '@/components/RunnersTab';
import SettingsTab from '@/components/SettingsTab';

export default function Home() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'pipelines':
        return <PipelinesTab />;
      case 'projects':
        return <ProjectsTab />;
      case 'runners':
        return <RunnersTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
