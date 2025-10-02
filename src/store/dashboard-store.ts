import { create } from 'zustand';
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
}

export const useDashboardStore = create<DashboardStore>((set) => ({
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
}));
