'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Search, RefreshCw, Filter, Calendar, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import PipelineCard from './PipelineCard';
import JobCard from './JobCard';
import LogViewer from './LogViewer';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPIAsync } from '@/lib/gitlab-api';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { formatDuration, formatPercentage } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';

export default function PipelinesTab() {
  const { projects, setProjects } = useDashboardStore();
  const { notifyPipelineRetry, notifyPipelineCancel, notifyError } = useNotifications();
  const { theme, card, textPrimary, textSecondary, input, inputFocus } = useTheme();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPipelines, setTotalPipelines] = useState(0);
  const pipelinesPerPage = 20;

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = async () => {
    try {
      const api = await getGitLabAPIAsync();
      const projectsList = await api.getProjects(1, 50);
      setProjects(projectsList);
      if (projectsList.length > 0 && !selectedProject) {
        setSelectedProject(projectsList[0].id);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  // Debounced pipeline loading to reduce API calls
  const debouncedLoadPipelines = useDebouncedCallback(() => {
    loadPipelines();
  }, 300);

  useEffect(() => {
    if (selectedProject) {
      setCurrentPage(1);
      debouncedLoadPipelines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, statusFilter, dateRange]);

  useEffect(() => {
    if (selectedProject) {
      loadPipelines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadPipelines = useCallback(async () => {
    if (!selectedProject) return;

    // Create abort controller for this request
    const controller = new AbortController();

    try {
      setIsLoading(true);
      const api = await getGitLabAPIAsync();

      // Calculate date filter
      const createdAfter = new Date();
      createdAfter.setDate(createdAfter.getDate() - parseInt(dateRange));

      // Load pipelines with pagination
      const pipelinesList = await api.getPipelines(selectedProject, currentPage, pipelinesPerPage);

      // Filter by status
      let filteredPipelines = pipelinesList;
      if (statusFilter !== 'all') {
        filteredPipelines = pipelinesList.filter(p => p.status === statusFilter);
      }

      // Filter by date range
      filteredPipelines = filteredPipelines.filter(p => {
        const pipelineDate = new Date(p.created_at);
        return pipelineDate >= createdAfter;
      });

      setPipelines(filteredPipelines);
      setTotalPipelines(filteredPipelines.length);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        console.error('Failed to load pipelines:', error);
      }
    } finally {
      setIsLoading(false);
    }

    // Cleanup function
    return () => {
      controller.abort();
    };
  }, [selectedProject, currentPage, pipelinesPerPage, dateRange, statusFilter]);

  const loadPipelineJobs = async (pipeline: Pipeline) => {
    try {
      setSelectedPipeline(pipeline);
      const api = await getGitLabAPIAsync();
      const jobsList = await api.getPipelineJobs(pipeline.project_id, pipeline.id);
      setJobs(jobsList);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadJobLogs = async (job: Job) => {
    try {
      setSelectedJob(job);
      const api = await getGitLabAPIAsync();
      const jobLogs = await api.getJobTrace(job.pipeline.project_id, job.id);
      setLogs(jobLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs');
    }
  };

  const handleRetryPipeline = async (pipeline: Pipeline) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.retryPipeline(pipeline.project_id, pipeline.id);
      notifyPipelineRetry(`#${pipeline.id}`);
      loadPipelines();
    } catch (error) {
      console.error('Failed to retry pipeline:', error);
      notifyError('Retry Failed', `Failed to retry pipeline #${pipeline.id}`);
    }
  };

  const handleCancelPipeline = async (pipeline: Pipeline) => {
    try {
      const api = await getGitLabAPIAsync();
      await api.cancelPipeline(pipeline.project_id, pipeline.id);
      notifyPipelineCancel(`#${pipeline.id}`);
      loadPipelines();
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
      notifyError('Cancel Failed', `Failed to cancel pipeline #${pipeline.id}`);
    }
  };

  const filteredProjects = useMemo(() =>
    projects.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.path_with_namespace.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [projects, searchTerm]
  );

  // Calculate statistics with memoization
  const stats = useMemo(() => {
    const successCount = pipelines.filter(p => p.status === 'success').length;
    const failedCount = pipelines.filter(p => p.status === 'failed').length;
    const runningCount = pipelines.filter(p => p.status === 'running').length;
    const pendingCount = pipelines.filter(p => p.status === 'pending').length;
    const pipelinesWithDuration = pipelines.filter(p => p.duration);

    return {
      total: pipelines.length,
      success: successCount,
      failed: failedCount,
      running: runningCount,
      pending: pendingCount,
      avgDuration: pipelinesWithDuration.length > 0
        ? pipelinesWithDuration.reduce((sum, p) => sum + (p.duration || 0), 0) / pipelinesWithDuration.length
        : 0,
      successRate: pipelines.length > 0
        ? formatPercentage((successCount / pipelines.length) * 100)
        : '0',
    };
  }, [pipelines]);

  const totalPages = Math.ceil(totalPipelines / pipelinesPerPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${textPrimary}`}>Pipelines</h1>
        <p className={textSecondary}>Browse and manage CI/CD pipelines</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Projects Sidebar */}
        <div className="col-span-3 space-y-4">
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
            />
          </div>

          <div className={`rounded-xl overflow-hidden border ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'} ${card}`}>
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredProjects.map((project, index) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`w-full text-left px-4 py-3 transition-all duration-300 hover:scale-[1.02] ${
                    theme === 'light'
                      ? `border-b border-gray-200 hover:bg-gray-50 ${
                          selectedProject === project.id
                            ? 'bg-gradient-to-r from-orange-50 to-orange-100/50 border-l-4 border-l-orange-500 shadow-sm'
                            : ''
                        }`
                      : `border-b border-zinc-800 hover:bg-zinc-800/50 ${
                          selectedProject === project.id
                            ? 'bg-gradient-to-r from-orange-500/10 to-orange-500/5 border-l-4 border-l-orange-500 shadow-lg shadow-orange-500/10'
                            : ''
                        }`
                  }`}
                  style={{
                    animationDelay: `${index * 30}ms`,
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {project.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.avatar_url}
                        alt={project.name}
                        className="w-10 h-10 rounded-lg object-cover border border-orange-500/30"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-md">
                        <span className="text-white font-bold text-sm">
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${selectedProject === project.id ? 'text-orange-600' : textPrimary}`}>
                        {project.name}
                      </p>
                      <p className={`text-xs truncate ${textSecondary}`}>{project.namespace.name}</p>
                    </div>
                    {selectedProject === project.id && (
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pipelines List */}
        <div className={`col-span-9 space-y-4 `}>
          {/* Statistics Cards */}
          {selectedProject && (
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 `}>
              <div className={`rounded-xl p-4 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:from-blue-100 hover:to-blue-200 shadow-sm hover:shadow-md'
                  : 'bg-gradient-to-br from-blue-500/10 to-blue-600/20 border-blue-500/30 hover:from-blue-500/20 hover:to-blue-600/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    theme === 'light' ? 'bg-blue-500/20' : 'bg-blue-500/10'
                  }`}>
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>Total Runs</p>
                    <p className={`text-2xl font-bold ${textPrimary}`}>{stats.total}</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl p-4 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:from-green-100 hover:to-green-200 shadow-sm hover:shadow-md'
                  : 'bg-gradient-to-br from-green-500/10 to-green-600/20 border-green-500/30 hover:from-green-500/20 hover:to-green-600/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    theme === 'light' ? 'bg-green-500/20' : 'bg-green-500/10'
                  }`}>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'light' ? 'text-green-700' : 'text-green-400'}`}>Success Rate</p>
                    <p className={`text-2xl font-bold ${theme === 'light' ? 'text-green-600' : textPrimary}`}>{stats.successRate}%</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl p-4 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:from-purple-100 hover:to-purple-200 shadow-sm hover:shadow-md'
                  : 'bg-gradient-to-br from-purple-500/10 to-purple-600/20 border-purple-500/30 hover:from-purple-500/20 hover:to-purple-600/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    theme === 'light' ? 'bg-purple-500/20' : 'bg-purple-500/10'
                  }`}>
                    <Clock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'light' ? 'text-purple-700' : 'text-purple-400'}`}>Avg Duration</p>
                    <p className={`text-2xl font-bold ${theme === 'light' ? 'text-purple-600' : textPrimary}`}>{formatDuration(stats.avgDuration)}</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl p-4 border transition-all ${
                theme === 'light'
                  ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 hover:from-red-100 hover:to-red-200 shadow-sm hover:shadow-md'
                  : 'bg-gradient-to-br from-red-500/10 to-red-600/20 border-red-500/30 hover:from-red-500/20 hover:to-red-600/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    theme === 'light' ? 'bg-red-500/20' : 'bg-red-500/10'
                  }`}>
                    <XCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className={`text-xs ${theme === 'light' ? 'text-red-700' : 'text-red-400'}`}>Failed</p>
                    <p className={`text-2xl font-bold ${theme === 'light' ? 'text-red-600' : textPrimary}`}>{stats.failed}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pipeline Status Distribution Chart */}
          {selectedProject && pipelines.length > 0 && (
            <div className={`rounded-xl p-6 ${card} ${theme === 'light' ? 'shadow-sm' : ''} `}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <BarChart3 className="w-5 h-5 text-orange-500" />
                Pipeline Status Distribution
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Success', value: stats.success, color: '#10b981' },
                        { name: 'Failed', value: stats.failed, color: '#ef4444' },
                        { name: 'Running', value: stats.running, color: '#3b82f6' },
                        { name: 'Pending', value: stats.pending, color: '#f59e0b' },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[
                        { name: 'Success', value: stats.success, color: '#10b981' },
                        { name: 'Failed', value: stats.failed, color: '#ef4444' },
                        { name: 'Running', value: stats.running, color: '#3b82f6' },
                        { name: 'Pending', value: stats.pending, color: '#f59e0b' },
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'light' ? '#ffffff' : '#1f2937',
                        border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col justify-center space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className={`text-sm ${textSecondary}`}>Success</span>
                    </div>
                    <span className={`text-sm font-semibold ${textPrimary}`}>{stats.success}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className={`text-sm ${textSecondary}`}>Failed</span>
                    </div>
                    <span className={`text-sm font-semibold ${textPrimary}`}>{stats.failed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className={`text-sm ${textSecondary}`}>Running</span>
                    </div>
                    <span className={`text-sm font-semibold ${textPrimary}`}>{stats.running}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                      <span className={`text-sm ${textSecondary}`}>Pending</span>
                    </div>
                    <span className={`text-sm font-semibold ${textPrimary}`}>{stats.pending}</span>
                  </div>
                  <div className={`pt-3 border-t ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${textSecondary}`}>Success Rate</span>
                      <span className={`text-lg font-bold ${parseFloat(stats.successRate as string) >= 80 ? 'text-green-500' : parseFloat(stats.successRate as string) >= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                        {stats.successRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters and Actions */}
          <div className={`flex items-center justify-between gap-4 `}>
            <div className="flex items-center gap-4">
              {/* Status Filter */}
              <div className="relative">
                <Filter className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="running">Running</option>
                  <option value="pending">Pending</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              {/* Date Range Filter */}
              <div className="relative">
                <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className={`pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-orange-500 ${input} ${inputFocus}`}
                >
                  <option value="1">Last 24 hours</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </select>
              </div>
            </div>

            <button
              onClick={loadPipelines}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {!selectedPipeline ? (
            <>
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 `}>
                {pipelines.length > 0 ? (
                  pipelines.map((pipeline) => (
                    <PipelineCard
                      key={pipeline.id}
                      pipeline={pipeline}
                      onClick={() => loadPipelineJobs(pipeline)}
                      onRetry={() => handleRetryPipeline(pipeline)}
                      onCancel={() => handleCancelPipeline(pipeline)}
                    />
                  ))
                ) : (
                  <div className="col-span-2 text-center py-12">
                    <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${
                      theme === 'light' ? 'text-gray-400' : 'text-zinc-600'
                    }`} />
                    <p className={textSecondary}>No pipelines found for selected filters</p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                        : 'bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-800'
                    }`}
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg transition-colors ${
                            currentPage === pageNum
                              ? 'bg-orange-500 text-white'
                              : theme === 'light'
                              ? 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                              : 'bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                        : 'bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-800'
                    }`}
                  >
                    Next
                  </button>

                  <span className={`ml-4 ${textSecondary}`}>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setSelectedPipeline(null);
                    setJobs([]);
                  }}
                  className="text-orange-500 hover:text-orange-400 transition-colors"
                >
                  ← Back to pipelines
                </button>
                <h3 className={`text-lg font-semibold ${textPrimary}`}>
                  Pipeline #{selectedPipeline.id} - Jobs
                </h3>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                </div>
              ) : jobs.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onViewLogs={() => loadJobLogs(job)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${
                    theme === 'light' ? 'text-gray-400' : 'text-zinc-600'
                  }`} />
                  <p className={textSecondary}>No jobs found for this pipeline</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedJob && logs && (
        <LogViewer
          logs={logs}
          jobName={selectedJob.name}
          onClose={() => {
            setSelectedJob(null);
            setLogs('');
          }}
        />
      )}
    </div>
  );
}
