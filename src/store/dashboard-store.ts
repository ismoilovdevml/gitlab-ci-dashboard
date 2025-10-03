import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Pipeline, Project, Runner, PipelineStats } from '@/lib/gitlab-api';

interface DashboardStore {
  projects: Project[];
  activePipelines: Pipeline[];
  runners: Runner[];
  stats: PipelineStats | null;
  selectedProject: Project | null;
  selectedPipeline: Pipeline | null;
  isLoading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number;
  theme: 'dark' | 'light';
  notifyPipelineFailures: boolean;
  notifyPipelineSuccess: boolean;

  setProjects: (projects: Project[]) => void;
  setActivePipelines: (pipelines: Pipeline[]) => void;
  setRunners: (runners: Runner[]) => void;
  setStats: (stats: PipelineStats) => void;
  setSelectedProject: (project: Project | null) => void;
  setSelectedPipeline: (pipeline: Pipeline | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setAutoRefresh: (autoRefresh: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setNotifyPipelineFailures: (notify: boolean) => void;
  setNotifyPipelineSuccess: (notify: boolean) => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: number;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      projects: [],
      activePipelines: [],
      runners: [],
      stats: null,
      selectedProject: null,
      selectedPipeline: null,
      isLoading: false,
      error: null,
      autoRefresh: true,
      refreshInterval: 10000, // 10 seconds
      theme: 'dark',
      notifyPipelineFailures: true,
      notifyPipelineSuccess: false,
      notifications: [],

      setProjects: (projects) => set({ projects }),
      setActivePipelines: (activePipelines) => set({ activePipelines }),
      setRunners: (runners) => set({ runners }),
      setStats: (stats) => set({ stats }),
      setSelectedProject: (selectedProject) => set({ selectedProject }),
      setSelectedPipeline: (selectedPipeline) => set({ selectedPipeline }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
      setTheme: (theme) => set({ theme }),
      setNotifyPipelineFailures: (notifyPipelineFailures) => set({ notifyPipelineFailures }),
      setNotifyPipelineSuccess: (notifyPipelineSuccess) => set({ notifyPipelineSuccess }),
      addNotification: (notification) => set((state) => ({
        notifications: [...state.notifications, notification],
      })),
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    }),
    {
      name: 'gitlab-dashboard-storage',
      // Only persist theme preference - NO sensitive data!
      partialize: (state) => ({
        theme: state.theme,
      }),
    }
  )
);
