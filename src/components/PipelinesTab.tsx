'use client';

import { useEffect, useState } from 'react';
import { Search, RefreshCw, Filter, Calendar, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import PipelineCard from './PipelineCard';
import JobCard from './JobCard';
import LogViewer from './LogViewer';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { Pipeline, Job } from '@/lib/gitlab-api';
import { formatDuration } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

export default function PipelinesTab() {
  const { projects, setProjects } = useDashboardStore();
  const { notifyPipelineRetry, notifyPipelineCancel, notifyError } = useNotifications();
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
      const api = getGitLabAPI();
      const projectsList = await api.getProjects(1, 50);
      setProjects(projectsList);
      if (projectsList.length > 0 && !selectedProject) {
        setSelectedProject(projectsList[0].id);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      setCurrentPage(1);
      loadPipelines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, statusFilter, dateRange]);

  useEffect(() => {
    if (selectedProject) {
      loadPipelines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadPipelines = async () => {
    if (!selectedProject) return;
    try {
      setIsLoading(true);
      const api = getGitLabAPI();

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
      console.error('Failed to load pipelines:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPipelineJobs = async (pipeline: Pipeline) => {
    try {
      setSelectedPipeline(pipeline);
      const api = getGitLabAPI();
      const jobsList = await api.getPipelineJobs(pipeline.project_id, pipeline.id);
      setJobs(jobsList);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadJobLogs = async (job: Job) => {
    try {
      setSelectedJob(job);
      const api = getGitLabAPI();
      const jobLogs = await api.getJobTrace(job.pipeline.project_id, job.id);
      setLogs(jobLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs');
    }
  };

  const handleRetryPipeline = async (pipeline: Pipeline) => {
    try {
      const api = getGitLabAPI();
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
      const api = getGitLabAPI();
      await api.cancelPipeline(pipeline.project_id, pipeline.id);
      notifyPipelineCancel(`#${pipeline.id}`);
      loadPipelines();
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
      notifyError('Cancel Failed', `Failed to cancel pipeline #${pipeline.id}`);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.path_with_namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate statistics
  const stats = {
    total: pipelines.length,
    success: pipelines.filter(p => p.status === 'success').length,
    failed: pipelines.filter(p => p.status === 'failed').length,
    running: pipelines.filter(p => p.status === 'running').length,
    pending: pipelines.filter(p => p.status === 'pending').length,
    avgDuration: pipelines.length > 0
      ? pipelines
          .filter(p => p.duration)
          .reduce((sum, p) => sum + (p.duration || 0), 0) / pipelines.filter(p => p.duration).length
      : 0,
    successRate: pipelines.length > 0
      ? ((pipelines.filter(p => p.status === 'success').length / pipelines.length) * 100).toFixed(1)
      : 0,
  };

  const totalPages = Math.ceil(totalPipelines / pipelinesPerPage);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Pipelines</h1>
        <p className="text-zinc-400">Browse and manage CI/CD pipelines</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Projects Sidebar */}
        <div className="col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800 transition-colors ${
                    selectedProject === project.id ? 'bg-orange-500/10 border-l-4 border-l-orange-500' : ''
                  }`}
                >
                  <p className="text-white text-sm font-medium truncate">{project.name}</p>
                  <p className="text-zinc-500 text-xs truncate">{project.namespace.name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pipelines List */}
        <div className="col-span-9 space-y-4">
          {/* Statistics Cards */}
          {selectedProject && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Total Runs</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Success Rate</p>
                    <p className="text-2xl font-bold text-white">{stats.successRate}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Avg Duration</p>
                    <p className="text-2xl font-bold text-white">{formatDuration(stats.avgDuration)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Failed</p>
                    <p className="text-2xl font-bold text-white">{stats.failed}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters and Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Status Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-orange-500"
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
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-orange-500"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <AlertCircle className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                    <p className="text-zinc-400">No pipelines found for selected filters</p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>

                  <span className="ml-4 text-zinc-400">
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
                <h3 className="text-lg font-semibold text-white">
                  Pipeline #{selectedPipeline.id} - Jobs
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onViewLogs={() => loadJobLogs(job)}
                  />
                ))}
              </div>
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
