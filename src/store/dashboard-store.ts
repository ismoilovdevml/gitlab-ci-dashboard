import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  activeTab: string;

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
  setActiveTab: (tab: string) => void;
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

type PersistedDashboardState = Pick<
  DashboardStore,
  | 'theme'
  | 'activeTab'
  | 'autoRefresh'
  | 'refreshInterval'
  | 'notifyPipelineFailures'
  | 'notifyPipelineSuccess'
>;

const PERSISTED_KEYS: ReadonlyArray<keyof PersistedDashboardState> = [
  'theme',
  'activeTab',
  'autoRefresh',
  'refreshInterval',
  'notifyPipelineFailures',
  'notifyPipelineSuccess',
];

function pickPersisted(state: Partial<PersistedDashboardState>): Partial<PersistedDashboardState> {
  const out: Record<string, unknown> = {};
  for (const key of PERSISTED_KEYS) {
    if (state[key] !== undefined) out[key] = state[key];
  }
  return out as Partial<PersistedDashboardState>;
}

/**
 * Older builds persisted `gitlabUrl` / `gitlabToken` under the same key.
 * Keep only the current preference fields so a stale token is dropped from
 * localStorage on first load.
 */
export function migrateDashboardState(persisted: unknown): Partial<PersistedDashboardState> {
  if (!persisted || typeof persisted !== 'object') return {};
  return pickPersisted(persisted as Partial<PersistedDashboardState>);
}

export const DASHBOARD_STORE_VERSION = 1;

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
      activeTab: 'overview',
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
      setActiveTab: (activeTab) => set({ activeTab }),
      addNotification: (notification) => set((state) => ({
        notifications: [...state.notifications, notification],
      })),
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    }),
    {
      name: 'gitlab-dashboard-storage',
      storage: createJSONStorage(() => localStorage),
      version: DASHBOARD_STORE_VERSION,
      migrate: (persisted) => migrateDashboardState(persisted) as DashboardStore,
      partialize: (state): PersistedDashboardState => ({
        theme: state.theme,
        activeTab: state.activeTab,
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
        notifyPipelineFailures: state.notifyPipelineFailures,
        notifyPipelineSuccess: state.notifyPipelineSuccess,
      }),
    }
  )
);
