'use client';

import { useEffect, useState, useMemo } from 'react';
import { Activity, GitBranch, CheckCircle, XCircle, Clock, Search, Award, Zap, TrendingUp } from 'lucide-react';
import StatsCard from './StatsCard';
import PipelineDetailsModal from './PipelineDetailsModal';
import PipelineListModal from './PipelineListModal';
import JobDetailsModal from './JobDetailsModal';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { getStatusIcon, formatRelativeTime } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

export default function Overview() {
  const {
    stats,
    projects,
    setActivePipelines,
    setStats,
    setIsLoading,
    setError,
    autoRefresh,
    refreshInterval
  } = useDashboardStore();

  const { theme, textPrimary, textSecondary, card, input, inputFocus } = useTheme();
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showPipelineList, setShowPipelineList] = useState<{ title: string; status?: string } | null>(null);
  const [recentPipelines, setRecentPipelines] = useState<Pipeline[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedJobProjectId, setSelectedJobProjectId] = useState<number | null>(null);

  const loadData = async (abortSignal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);

      // Get API instance from database configuration
      const api = await getGitLabAPIAsync();

      const [pipelines, pipelineStats] = await Promise.all([
        api.getAllActivePipelines(),
        api.getPipelineStats(),
      ]);

      // Check if aborted
      if (abortSignal?.aborted) return;

      setActivePipelines(pipelines);
      setStats(pipelineStats);

      // Load recent pipelines from ALL projects for accurate Top Active Projects
      // Increase to get better pipeline count statistics
      const recentPromises = projects.map(project =>
        api.getPipelines(project.id, 1, 10).catch(() => [])
      );
      const allRecent = await Promise.all(recentPromises);

      // Check if aborted before setting state
      if (abortSignal?.aborted) return;

      const recent = allRecent
        .flat()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 50);  // Keep more pipelines for accurate counting
      setRecentPipelines(recent);

      // Load active jobs from running pipelines
      const runningPipelines = pipelines.slice(0, 5);
      const jobsPromises = runningPipelines.map(pipeline =>
        api.getPipelineJobs(pipeline.project_id, pipeline.id).catch(() => [])
      );
      const allJobs = await Promise.all(jobsPromises);

      if (!abortSignal?.aborted) {
        const jobs = allJobs
          .flat()
          .filter(job => job.status === 'running' || job.status === 'pending')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);

        // Enrich jobs with project data from store
        const enrichedJobs = jobs.map(job => {
          const projectData = projects.find(p => p.id === job.pipeline.project_id);
          if (projectData && !job.project) {
            // Add project data to job if missing
            return {
              ...job,
              project: {
                id: projectData.id,
                name: projectData.name,
                name_with_namespace: projectData.name_with_namespace
              }
            };
          }
          return job;
        });

        setActiveJobs(enrichedJobs);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Data loading was cancelled');
      } else {
        console.error('Failed to load data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    loadData(controller.signal);

    if (autoRefresh) {
      const interval = setInterval(() => loadData(controller.signal), refreshInterval);
      return () => {
        clearInterval(interval);
        controller.abort();
      };
    }

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval]);

  // Top projects by total pipeline run count (most active)
  const topProjects = useMemo(() => {
    interface ProjectCount {
      project: typeof projects[0];
      count: number;
      lastActivity: string;
    }
    const projectPipelineCounts = new Map<number, ProjectCount>();

    // Count all recent pipelines per project
    recentPipelines.forEach(pipeline => {
      const project = projects.find(p => p.id === pipeline.project_id);
      if (project) {
        const existing = projectPipelineCounts.get(project.id);
        if (existing) {
          existing.count++;
          // Keep track of latest activity
          if (new Date(pipeline.updated_at) > new Date(existing.lastActivity)) {
            existing.lastActivity = pipeline.updated_at;
          }
        } else {
          projectPipelineCounts.set(project.id, {
            project,
            count: 1,
            lastActivity: pipeline.updated_at
          });
        }
      }
    });

    // Sort by pipeline count (descending), then by last activity (most recent first)
    return Array.from(projectPipelineCounts.values())
      .sort((a, b) => {
        // Primary sort: by count (higher first)
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        // Secondary sort: by last activity (more recent first)
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      })
      .slice(0, 5);
  }, [recentPipelines, projects]);

  // Filter pipelines and jobs based on search
  const filteredPipelines = useMemo(() => {
    if (!searchTerm) return recentPipelines;
    const term = searchTerm.toLowerCase();
    return recentPipelines.filter(pipeline => {
      const project = projects.find(p => p.id === pipeline.project_id);
      return project?.name.toLowerCase().includes(term) ||
        pipeline.ref.toLowerCase().includes(term) ||
        pipeline.id.toString().includes(term);
    });
  }, [recentPipelines, searchTerm, projects]);

  const filteredJobs = useMemo(() => {
    if (!searchTerm) return activeJobs;
    const term = searchTerm.toLowerCase();
    return activeJobs.filter(job =>
      job.name.toLowerCase().includes(term) ||
      job.stage?.toLowerCase().includes(term)
    );
  }, [activeJobs, searchTerm]);


  return (
    <div className="space-y-4">
      {/* Header with Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>Control Center</h1>
          <p className={`text-sm ${textSecondary}`}>Manage and monitor all CI/CD operations</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-80">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="Search pipelines, jobs, projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm transition-all ${input} ${inputFocus}`}
            />
          </div>
          {/* Live Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-green-500 whitespace-nowrap">Live • {refreshInterval / 1000}s</span>
          </div>
        </div>
      </div>

      {/* Essential Statistics - All Clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => setShowPipelineList({ title: 'Running Pipelines', status: 'running' })}
          className="cursor-pointer"
        >
          <StatsCard
            title="Running"
            value={stats?.running || 0}
            icon={Activity}
            color="blue"
          />
        </div>
        <div
          onClick={() => setShowPipelineList({ title: 'Successful Pipelines', status: 'success' })}
          className="cursor-pointer"
        >
          <StatsCard
            title="Success"
            value={stats?.success || 0}
            icon={CheckCircle}
            color="green"
          />
        </div>
        <div
          onClick={() => setShowPipelineList({ title: 'Failed Pipelines', status: 'failed' })}
          className="cursor-pointer"
        >
          <StatsCard
            title="Failed"
            value={stats?.failed || 0}
            icon={XCircle}
            color="red"
          />
        </div>
        <div
          onClick={() => setShowPipelineList({ title: 'Pending Pipelines', status: 'pending' })}
          className="cursor-pointer"
        >
          <StatsCard
            title="Pending"
            value={stats?.pending || 0}
            icon={Clock}
            color="yellow"
          />
        </div>
        <div
          onClick={() => setShowPipelineList({ title: 'All Pipelines' })}
          className="cursor-pointer"
        >
          <StatsCard
            title="Total"
            value={stats?.total || 0}
            icon={GitBranch}
            color="purple"
          />
        </div>
      </div>

      {/* Active Jobs - Currently Running */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            <h2 className={`text-lg font-semibold ${textPrimary}`}>Active Jobs</h2>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            filteredJobs.length > 0
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-gray-500/10 text-gray-500'
          }`}>
            {filteredJobs.length} running
          </span>
        </div>

        {filteredJobs.length === 0 ? (
          <div className={`rounded-xl p-6 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
            <Zap className={`w-10 h-10 mx-auto mb-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
            <p className={`text-sm ${textSecondary}`}>No active jobs running</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredJobs.map((job) => {
              // Multiple fallback strategies to get project name
              const project = projects.find(p => p.id === job.pipeline.project_id);
              const projectName = project?.name ||
                                 job.project?.name ||
                                 job.project?.name_with_namespace ||
                                 'Loading...';

              return (
                <div
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job);
                    setSelectedJobProjectId(job.pipeline.project_id);
                  }}
                  className={`rounded-lg p-3 transition-all cursor-pointer group ${card} ${
                    theme === 'light'
                      ? 'shadow-sm hover:shadow-md hover:border-[#d2d2d7]'
                      : 'hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {/* Status Icon */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${
                      job.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {job.status === 'running' ? <Activity className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-sm truncate group-hover:text-blue-500 transition-colors ${textPrimary}`}>
                        {job.name}
                      </h3>
                      <p className={`text-xs truncate ${textSecondary}`}>{projectName}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                    <GitBranch className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{job.ref}</span>
                    <span className="whitespace-nowrap ml-auto">{formatRelativeTime(job.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Pipeline History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <h2 className={`text-lg font-semibold ${textPrimary}`}>Recent Builds</h2>
          </div>
          <button
            onClick={() => setShowPipelineList({ title: 'All Recent Pipelines' })}
            className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
          >
            View All →
          </button>
        </div>

        {filteredPipelines.length === 0 ? (
          <div className={`rounded-xl p-6 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
            <Clock className={`w-10 h-10 mx-auto mb-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
            <p className={`text-sm ${textSecondary}`}>No recent builds</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPipelines.slice(0, 9).map((pipeline, index) => {
              const project = projects.find(p => p.id === pipeline.project_id);
              return (
                <div
                  key={pipeline.id}
                  onClick={() => {
                    setSelectedPipeline(pipeline);
                    setSelectedProjectId(pipeline.project_id);
                  }}
                  className={`rounded-lg p-3 transition-all cursor-pointer group ${card} ${
                    theme === 'light'
                      ? 'shadow-sm hover:shadow-md hover:border-[#d2d2d7]'
                      : 'hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {/* Build Number Badge - Smaller */}
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      index === 0 ? 'bg-orange-500/20 text-orange-500' :
                      index === 1 ? 'bg-orange-500/15 text-orange-400' :
                      index === 2 ? 'bg-orange-500/10 text-orange-300' :
                      theme === 'light' ? 'bg-gray-100 text-gray-500' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {index + 1}
                    </div>
                    {/* Status Icon */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                      pipeline.status === 'success' ? 'bg-green-500/10 text-green-500' :
                      pipeline.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                      pipeline.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {getStatusIcon(pipeline.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-sm truncate group-hover:text-orange-500 transition-colors ${textPrimary}`}>
                        {project?.name || 'Unknown'}
                      </h3>
                      <p className={`text-xs ${textSecondary}`}>Pipeline #{pipeline.id}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                    <GitBranch className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{pipeline.ref}</span>
                    <span className="whitespace-nowrap ml-auto">{formatRelativeTime(pipeline.updated_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Projects by Pipeline Count */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-purple-500" />
            <h2 className={`text-lg font-semibold ${textPrimary}`}>Top Active Projects</h2>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-500`}>
            By pipeline count
          </span>
        </div>

        {topProjects.length === 0 ? (
          <div className={`rounded-xl p-6 text-center ${card} ${theme === 'light' ? 'shadow-sm' : ''}`}>
            <TrendingUp className={`w-10 h-10 mx-auto mb-2 ${theme === 'light' ? 'text-[#86868b]' : 'text-zinc-700'}`} />
            <p className={`text-sm ${textSecondary}`}>No project activity</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {topProjects.map(({ project, count }, index) => (
              <div
                key={project.id}
                className={`rounded-lg p-4 transition-all group ${card} ${
                  theme === 'light'
                    ? 'shadow-sm hover:shadow-md hover:border-[#d2d2d7]'
                    : 'hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                    index === 1 ? 'bg-gray-400/20 text-gray-400' :
                    index === 2 ? 'bg-orange-500/20 text-orange-500' :
                    'bg-purple-500/10 text-purple-500'
                  }`}>
                    #{index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-sm truncate ${textPrimary}`}>
                      {project.name}
                    </h3>
                    <p className={`text-xs ${textSecondary}`}>{project.namespace?.name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${textSecondary}`}>Pipelines</span>
                  <span className={`text-lg font-bold ${textPrimary}`}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showPipelineList && (
        <PipelineListModal
          title={showPipelineList.title}
          status={showPipelineList.status}
          onClose={() => setShowPipelineList(null)}
        />
      )}

      {selectedPipeline && selectedProjectId && (
        <PipelineDetailsModal
          pipeline={selectedPipeline}
          projectId={selectedProjectId}
          onClose={() => {
            setSelectedPipeline(null);
            setSelectedProjectId(null);
          }}
        />
      )}

      {/* Job Details Modal */}
      {selectedJob && selectedJobProjectId && (
        <JobDetailsModal
          job={selectedJob}
          projectId={selectedJobProjectId}
          onClose={() => {
            setSelectedJob(null);
            setSelectedJobProjectId(null);
          }}
        />
      )}
    </div>
  );
}
