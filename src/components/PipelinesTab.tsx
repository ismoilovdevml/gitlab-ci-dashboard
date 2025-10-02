'use client';

import { useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import PipelineCard from './PipelineCard';
import JobCard from './JobCard';
import LogViewer from './LogViewer';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';
import { Pipeline, Job } from '@/lib/gitlab-api';

export default function PipelinesTab() {
  const { projects, setProjects } = useDashboardStore();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProjects();
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
      loadPipelines();
    }
  }, [selectedProject]);

  const loadPipelines = async () => {
    if (!selectedProject) return;
    try {
      setIsLoading(true);
      const api = getGitLabAPI();
      const pipelinesList = await api.getPipelines(selectedProject, 1, 50);
      setPipelines(pipelinesList);
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
      loadPipelines();
    } catch (error) {
      console.error('Failed to retry pipeline:', error);
    }
  };

  const handleCancelPipeline = async (pipeline: Pipeline) => {
    try {
      const api = getGitLabAPI();
      await api.cancelPipeline(pipeline.project_id, pipeline.id);
      loadPipelines();
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.path_with_namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              {selectedProject && projects.find(p => p.id === selectedProject)?.name}
            </h2>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pipelines.map((pipeline) => (
                <PipelineCard
                  key={pipeline.id}
                  pipeline={pipeline}
                  onClick={() => loadPipelineJobs(pipeline)}
                  onRetry={() => handleRetryPipeline(pipeline)}
                  onCancel={() => handleCancelPipeline(pipeline)}
                />
              ))}
            </div>
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
