import axios, { AxiosInstance } from 'axios';
import { cachedFetch, CacheTTL } from './cache';

// Export cache utilities for external use
export { invalidateCache, getCache } from './cache';

export interface Pipeline {
  id: number;
  project_id: number;
  status: 'created' | 'waiting_for_resource' | 'preparing' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped' | 'manual';
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string;
  duration: number;
  user: {
    name: string;
    username: string;
    avatar_url: string;
  };
}

export interface Job {
  id: number;
  status: string;
  stage: string;
  name: string;
  ref: string;
  created_at: string;
  started_at: string;
  finished_at: string;
  duration: number;
  user: {
    name: string;
    username: string;
    avatar_url: string;
  };
  commit: {
    id: string;
    short_id: string;
    title: string;
    author_name: string;
  };
  pipeline: {
    id: number;
    project_id: number;
    ref: string;
    sha: string;
    status: string;
  };
  web_url: string;
  project: {
    id: number;
    name: string;
    name_with_namespace: string;
  };
  artifacts_file?: {
    filename: string;
    size: number;
  };
}

export interface Project {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  avatar_url: string;
  star_count: number;
  forks_count: number;
  last_activity_at: string;
  visibility: 'public' | 'private' | 'internal';
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
  };
}

export interface Runner {
  id: number;
  description: string;
  ip_address: string;
  active: boolean;
  is_shared: boolean;
  runner_type: string;
  name: string;
  online: boolean;
  status: 'online' | 'offline' | 'not_connected' | 'paused';
  contacted_at: string;
  architecture: string;
  platform: string;
  projects: Array<{
    id: number;
    name: string;
  }>;
}

export interface PipelineStats {
  total: number;
  running: number;
  pending: number;
  success: number;
  failed: number;
  canceled: number;
}

export interface Artifact {
  id: number;
  file_type: string;
  size: number;
  filename: string;
  file_format: string;
  created_at: string;
  expired_at: string | null;
  expire_at: string | null;
}

export interface JobArtifact extends Job {
  artifacts?: Artifact[];
  artifacts_file?: {
    filename: string;
    size: number;
  };
}

export interface ContainerRepository {
  id: number;
  name: string;
  path: string;
  project_id: number;
  location: string;
  created_at: string;
  cleanup_policy_started_at: string | null;
  tags_count: number;
  tags?: ContainerTag[];
}

export interface ContainerTag {
  name: string;
  path: string;
  location: string;
  revision: string;
  short_revision: string;
  digest: string;
  created_at: string;
  total_size: number;
}

// CI/CD Insights Interfaces
export interface FailureAnalysis {
  job_id: number;
  job_name: string;
  project_name: string;
  failure_reason: string;
  error_message: string;
  failure_type: 'script_failure' | 'runner_system_failure' | 'timeout' | 'cancelled' | 'unknown';
  failed_at: string;
  duration: number;
  retry_count: number;
}

export interface FlakyTest {
  test_name: string;
  job_name: string;
  project_name: string;
  total_runs: number;
  failure_count: number;
  success_count: number;
  failure_rate: number;
  last_failed: string;
  trend: 'improving' | 'worsening' | 'stable';
}

export interface PerformanceBottleneck {
  stage: string;
  job_name: string;
  project_name: string;
  avg_duration: number;
  max_duration: number;
  min_duration: number;
  total_runs: number;
  trend: 'improving' | 'worsening' | 'stable';
}

export interface ResourceUsage {
  timestamp: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  active_runners: number;
  queued_jobs: number;
}

export interface DeploymentFrequency {
  project_name: string;
  total_deployments: number;
  successful_deployments: number;
  failed_deployments: number;
  avg_deployment_time: number;
  deployments_per_day: number;
  last_deployment: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface InsightsSummary {
  total_pipelines: number;
  successful_pipelines: number;
  failed_pipelines: number;
  success_rate: number;
  avg_pipeline_duration: number;
  total_deployments: number;
  mttr: number; // Mean Time To Recovery
  change_failure_rate: number;
}

class GitLabAPI {
  private api: AxiosInstance;
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.api = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });
  }

  // Projects
  async getProjects(page = 1, perPage = 20): Promise<Project[]> {
    return cachedFetch(
      `/projects?page=${page}&perPage=${perPage}`,
      async () => {
        const response = await this.api.get('/projects', {
          params: {
            membership: true,
            order_by: 'last_activity_at',
            per_page: perPage,
            page,
            statistics: true,
          },
        });
        return response.data;
      },
      CacheTTL.LONG // 5 minutes cache for projects
    );
  }

  async starProject(projectId: number): Promise<Project> {
    const response = await this.api.post(`/projects/${projectId}/star`);
    return response.data;
  }

  async unstarProject(projectId: number): Promise<Project> {
    const response = await this.api.post(`/projects/${projectId}/unstar`);
    return response.data;
  }

  async getProject(projectId: number): Promise<Project> {
    const response = await this.api.get(`/projects/${projectId}`);
    return response.data;
  }

  // Pipelines
  async getPipelines(projectId: number, page = 1, perPage = 20): Promise<Pipeline[]> {
    return cachedFetch(
      `/projects/${projectId}/pipelines?page=${page}&perPage=${perPage}`,
      async () => {
        const response = await this.api.get(`/projects/${projectId}/pipelines`, {
          params: {
            per_page: perPage,
            page,
            order_by: 'updated_at',
          },
        });
        return response.data;
      },
      CacheTTL.MEDIUM // 2 minutes cache for pipelines
    );
  }

  async getAllActivePipelines(): Promise<Pipeline[]> {
    const projects = await this.getProjects(1, 100);
    const pipelinePromises = projects.map(project =>
      this.getPipelines(project.id, 1, 10).catch(() => [])
    );
    const allPipelines = await Promise.all(pipelinePromises);
    return allPipelines
      .flat()
      .filter(p => ['running', 'pending', 'created'].includes(p.status))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  async getPipeline(projectId: number, pipelineId: number): Promise<Pipeline> {
    const response = await this.api.get(`/projects/${projectId}/pipelines/${pipelineId}`);
    return response.data;
  }

  async retryPipeline(projectId: number, pipelineId: number): Promise<Pipeline> {
    const response = await this.api.post(`/projects/${projectId}/pipelines/${pipelineId}/retry`);
    return response.data;
  }

  async cancelPipeline(projectId: number, pipelineId: number): Promise<Pipeline> {
    const response = await this.api.post(`/projects/${projectId}/pipelines/${pipelineId}/cancel`);
    return response.data;
  }

  // Jobs
  async getPipelineJobs(projectId: number, pipelineId: number): Promise<Job[]> {
    const response = await this.api.get(`/projects/${projectId}/pipelines/${pipelineId}/jobs`);
    return response.data;
  }

  async getJob(projectId: number, jobId: number): Promise<Job> {
    const response = await this.api.get(`/projects/${projectId}/jobs/${jobId}`);
    return response.data;
  }

  async getJobTrace(projectId: number, jobId: number): Promise<string> {
    const response = await this.api.get(`/projects/${projectId}/jobs/${jobId}/trace`);
    return response.data;
  }

  async retryJob(projectId: number, jobId: number): Promise<Job> {
    const response = await this.api.post(`/projects/${projectId}/jobs/${jobId}/retry`);
    return response.data;
  }

  async cancelJob(projectId: number, jobId: number): Promise<Job> {
    const response = await this.api.post(`/projects/${projectId}/jobs/${jobId}/cancel`);
    return response.data;
  }

  async playJob(projectId: number, jobId: number): Promise<Job> {
    const response = await this.api.post(`/projects/${projectId}/jobs/${jobId}/play`);
    return response.data;
  }

  // Runners
  async getRunners(page = 1, perPage = 20): Promise<Runner[]> {
    return cachedFetch(
      `/runners/all?page=${page}&perPage=${perPage}`,
      async () => {
        const response = await this.api.get('/runners/all', {
          params: {
            per_page: perPage,
            page,
          },
        });
        return response.data;
      },
      CacheTTL.MEDIUM // 2 minutes cache for runners
    );
  }

  async getRunner(runnerId: number): Promise<Runner> {
    const response = await this.api.get(`/runners/${runnerId}`);
    return response.data;
  }

  // Statistics
  async getPipelineStats(): Promise<PipelineStats> {
    const projects = await this.getProjects(1, 100);
    const pipelinePromises = projects.map(project =>
      this.getPipelines(project.id, 1, 50).catch(() => [])
    );
    const allPipelines = await Promise.all(pipelinePromises);
    const pipelines = allPipelines.flat();

    return {
      total: pipelines.length,
      running: pipelines.filter(p => p.status === 'running').length,
      pending: pipelines.filter(p => p.status === 'pending').length,
      success: pipelines.filter(p => p.status === 'success').length,
      failed: pipelines.filter(p => p.status === 'failed').length,
      canceled: pipelines.filter(p => p.status === 'canceled').length,
    };
  }

  // Artifacts
  async getJobArtifacts(projectId: number, page = 1, perPage = 20): Promise<JobArtifact[]> {
    const response = await this.api.get(`/projects/${projectId}/jobs`, {
      params: {
        per_page: perPage,
        page,
        scope: ['success', 'failed'],
      },
    });
    return response.data.filter((job: Job) => job.artifacts_file);
  }

  async getAllArtifacts(): Promise<JobArtifact[]> {
    const projects = await this.getProjects(1, 50);
    const artifactPromises = projects.map(project =>
      this.getJobArtifacts(project.id, 1, 10).catch(() => [])
    );
    const allArtifacts = await Promise.all(artifactPromises);
    return allArtifacts.flat();
  }

  async downloadArtifact(projectId: number, jobId: number): Promise<Blob> {
    const response = await this.api.get(`/projects/${projectId}/jobs/${jobId}/artifacts`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async deleteArtifacts(projectId: number, jobId: number): Promise<void> {
    await this.api.delete(`/projects/${projectId}/jobs/${jobId}/artifacts`);
  }

  // Container Registry
  async getContainerRepositories(projectId: number): Promise<ContainerRepository[]> {
    const response = await this.api.get(`/projects/${projectId}/registry/repositories`);
    return response.data;
  }

  async getAllContainerRepositories(): Promise<ContainerRepository[]> {
    const projects = await this.getProjects(1, 50);
    const repoPromises = projects.map(project =>
      this.getContainerRepositories(project.id).catch(() => [])
    );
    const allRepos = await Promise.all(repoPromises);
    return allRepos.flat();
  }

  async getContainerTags(projectId: number, repositoryId: number): Promise<ContainerTag[]> {
    const response = await this.api.get(
      `/projects/${projectId}/registry/repositories/${repositoryId}/tags`
    );
    return response.data;
  }

  async deleteContainerTag(
    projectId: number,
    repositoryId: number,
    tagName: string
  ): Promise<void> {
    await this.api.delete(
      `/projects/${projectId}/registry/repositories/${repositoryId}/tags/${tagName}`
    );
  }

  async deleteContainerRepository(projectId: number, repositoryId: number): Promise<void> {
    await this.api.delete(`/projects/${projectId}/registry/repositories/${repositoryId}`);
  }

  // CI/CD Insights
  async getInsightsSummary(days = 30): Promise<InsightsSummary> {
    const projects = await this.getProjects(1, 100);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const pipelinePromises = projects.map(project =>
      this.getPipelines(project.id, 1, 100).catch(() => [])
    );
    const allPipelines = await Promise.all(pipelinePromises);
    const pipelines = allPipelines
      .flat()
      .filter(p => new Date(p.created_at) >= since);

    const successful = pipelines.filter(p => p.status === 'success').length;
    const failed = pipelines.filter(p => p.status === 'failed').length;
    const total = pipelines.length;

    const totalDuration = pipelines.reduce((sum, p) => sum + (p.duration || 0), 0);
    const avgDuration = total > 0 ? totalDuration / total : 0;

    // Calculate MTTR (Mean Time To Recovery)
    const failedPipelines = pipelines
      .filter(p => p.status === 'failed')
      .sort((a, b) => new Date(a.finished_at).getTime() - new Date(b.finished_at).getTime());

    let mttrSum = 0;
    let mttrCount = 0;

    for (let i = 0; i < failedPipelines.length; i++) {
      const failedPipeline = failedPipelines[i];
      const nextSuccess = pipelines.find(
        p =>
          p.project_id === failedPipeline.project_id &&
          p.status === 'success' &&
          new Date(p.created_at) > new Date(failedPipeline.created_at)
      );

      if (nextSuccess) {
        const recoveryTime =
          new Date(nextSuccess.finished_at).getTime() -
          new Date(failedPipeline.finished_at).getTime();
        mttrSum += recoveryTime / 1000 / 60; // Convert to minutes
        mttrCount++;
      }
    }

    const mttr = mttrCount > 0 ? mttrSum / mttrCount : 0;

    return {
      total_pipelines: total,
      successful_pipelines: successful,
      failed_pipelines: failed,
      success_rate: total > 0 ? (successful / total) * 100 : 0,
      avg_pipeline_duration: avgDuration,
      total_deployments: successful,
      mttr,
      change_failure_rate: total > 0 ? (failed / total) * 100 : 0,
    };
  }

  async getFailureAnalysis(days = 7): Promise<FailureAnalysis[]> {
    const projects = await this.getProjects(1, 100);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const failures: FailureAnalysis[] = [];

    for (const project of projects) {
      try {
        const pipelines = await this.getPipelines(project.id, 1, 50);
        const failedPipelines = pipelines.filter(p => p.status === 'failed');

        for (const pipeline of failedPipelines) {
          if (new Date(pipeline.created_at) < since) continue;

          const jobs = await this.getPipelineJobs(project.id, pipeline.id);
          const failedJobs = jobs.filter(j => j.status === 'failed');

          for (const job of failedJobs) {
            let failureReason = 'Unknown failure';
            let errorMessage = '';
            let failureType: FailureAnalysis['failure_type'] = 'unknown';

            try {
              const trace = await this.getJobTrace(project.id, job.id);

              // Parse logs for common failure patterns
              if (trace.includes('exit code 1') || trace.includes('Command failed')) {
                failureType = 'script_failure';
                const errorMatch = trace.match(/ERROR:(.+?)(\n|$)/i);
                errorMessage = errorMatch ? errorMatch[1].trim() : 'Script execution failed';
              } else if (trace.includes('timeout') || trace.includes('timed out')) {
                failureType = 'timeout';
                errorMessage = 'Job execution timeout';
              } else if (trace.includes('cancelled') || trace.includes('canceled')) {
                failureType = 'cancelled';
                errorMessage = 'Job was cancelled';
              } else if (trace.includes('runner') && trace.includes('system')) {
                failureType = 'runner_system_failure';
                errorMessage = 'Runner system failure';
              }

              failureReason = errorMessage || failureType;
            } catch {
              // If we can't get trace, use basic info
              failureReason = job.status;
            }

            failures.push({
              job_id: job.id,
              job_name: job.name,
              project_name: project.name,
              failure_reason: failureReason,
              error_message: errorMessage,
              failure_type: failureType,
              failed_at: job.finished_at,
              duration: job.duration || 0,
              retry_count: 0,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to analyze project ${project.id}:`, error);
      }
    }

    return failures.slice(0, 50); // Return top 50
  }

  async getFlakyTests(days = 30): Promise<FlakyTest[]> {
    const projects = await this.getProjects(1, 100);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const testStats = new Map<string, {
      job_name: string;
      project_name: string;
      total: number;
      failed: number;
      success: number;
      last_failed: string;
      recent_results: boolean[];
    }>();

    for (const project of projects) {
      try {
        const jobs = await this.api.get(`/projects/${project.id}/jobs`, {
          params: {
            per_page: 100,
            scope: ['success', 'failed'],
          },
        });

        for (const job of jobs.data) {
          if (new Date(job.created_at) < since) continue;
          if (!job.name.toLowerCase().includes('test')) continue;

          const key = `${project.name}:${job.name}`;
          const stats = testStats.get(key) || {
            job_name: job.name,
            project_name: project.name,
            total: 0,
            failed: 0,
            success: 0,
            last_failed: '',
            recent_results: [] as boolean[],
          };

          stats.total++;
          const isSuccess = job.status === 'success';
          stats.recent_results.push(isSuccess);

          if (job.status === 'failed') {
            stats.failed++;
            stats.last_failed = job.finished_at;
          } else if (job.status === 'success') {
            stats.success++;
          }

          testStats.set(key, stats);
        }
      } catch (error) {
        console.error(`Failed to get flaky tests for project ${project.id}:`, error);
      }
    }

    const flakyTests: FlakyTest[] = [];

    testStats.forEach((stats) => {
      if (stats.total < 3) return; // Need at least 3 runs
      const failureRate = (stats.failed / stats.total) * 100;

      // Flaky if failure rate is between 10% and 90%
      if (failureRate > 10 && failureRate < 90) {
        // Calculate trend
        const recentResults = stats.recent_results.slice(-5);
        const recentFailures = recentResults.filter(r => !r).length;
        const olderResults = stats.recent_results.slice(0, -5);
        const olderFailures = olderResults.filter(r => !r).length;

        let trend: FlakyTest['trend'] = 'stable';
        if (olderResults.length > 0) {
          const recentRate = recentFailures / recentResults.length;
          const olderRate = olderFailures / olderResults.length;
          if (recentRate < olderRate - 0.1) trend = 'improving';
          else if (recentRate > olderRate + 0.1) trend = 'worsening';
        }

        flakyTests.push({
          test_name: stats.job_name,
          job_name: stats.job_name,
          project_name: stats.project_name,
          total_runs: stats.total,
          failure_count: stats.failed,
          success_count: stats.success,
          failure_rate: failureRate,
          last_failed: stats.last_failed,
          trend,
        });
      }
    });

    return flakyTests.sort((a, b) => b.failure_rate - a.failure_rate);
  }

  async getPerformanceBottlenecks(days = 30): Promise<PerformanceBottleneck[]> {
    const projects = await this.getProjects(1, 100);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const stageStats = new Map<string, {
      durations: number[];
      recent_durations: number[];
    }>();

    for (const project of projects) {
      try {
        const pipelines = await this.getPipelines(project.id, 1, 50);

        for (const pipeline of pipelines) {
          if (new Date(pipeline.created_at) < since) continue;

          const jobs = await this.getPipelineJobs(project.id, pipeline.id);

          for (const job of jobs) {
            if (!job.duration || job.duration < 1) continue;

            const key = `${project.name}:${job.stage}:${job.name}`;
            const stats = stageStats.get(key) || {
              durations: [],
              recent_durations: [],
            };

            stats.durations.push(job.duration);
            if (stats.durations.length <= 10) {
              stats.recent_durations.push(job.duration);
            }

            stageStats.set(key, stats);
          }
        }
      } catch (error) {
        console.error(`Failed to get performance data for project ${project.id}:`, error);
      }
    }

    const bottlenecks: PerformanceBottleneck[] = [];

    stageStats.forEach((stats, key) => {
      if (stats.durations.length < 3) return;

      const [projectName, stage, jobName] = key.split(':');
      const avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      const maxDuration = Math.max(...stats.durations);
      const minDuration = Math.min(...stats.durations);

      // Calculate trend
      let trend: PerformanceBottleneck['trend'] = 'stable';
      if (stats.recent_durations.length >= 3) {
        const recentAvg =
          stats.recent_durations.reduce((a, b) => a + b, 0) / stats.recent_durations.length;
        const olderDurations = stats.durations.slice(0, -stats.recent_durations.length);
        if (olderDurations.length > 0) {
          const olderAvg = olderDurations.reduce((a, b) => a + b, 0) / olderDurations.length;
          if (recentAvg < olderAvg * 0.9) trend = 'improving';
          else if (recentAvg > olderAvg * 1.1) trend = 'worsening';
        }
      }

      bottlenecks.push({
        stage,
        job_name: jobName,
        project_name: projectName,
        avg_duration: avgDuration,
        max_duration: maxDuration,
        min_duration: minDuration,
        total_runs: stats.durations.length,
        trend,
      });
    });

    return bottlenecks
      .sort((a, b) => b.avg_duration - a.avg_duration)
      .slice(0, 20);
  }

  async getDeploymentFrequency(days = 30): Promise<DeploymentFrequency[]> {
    const projects = await this.getProjects(1, 100);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const deploymentStats: DeploymentFrequency[] = [];

    for (const project of projects) {
      try {
        const pipelines = await this.getPipelines(project.id, 1, 100);

        // Filter deployment pipelines (those with 'deploy' stage/job)
        const deploymentPipelines = [];

        for (const pipeline of pipelines) {
          if (new Date(pipeline.created_at) < since) continue;

          const jobs = await this.getPipelineJobs(project.id, pipeline.id);
          const hasDeployJob = jobs.some(
            j => j.stage.toLowerCase().includes('deploy') ||
                 j.name.toLowerCase().includes('deploy')
          );

          if (hasDeployJob) {
            deploymentPipelines.push(pipeline);
          }
        }

        if (deploymentPipelines.length === 0) continue;

        const successful = deploymentPipelines.filter(p => p.status === 'success').length;
        const failed = deploymentPipelines.filter(p => p.status === 'failed').length;
        const totalDuration = deploymentPipelines.reduce((sum, p) => sum + (p.duration || 0), 0);
        const avgTime = totalDuration / deploymentPipelines.length;
        const deploymentsPerDay = deploymentPipelines.length / days;

        const sortedDeployments = deploymentPipelines.sort(
          (a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime()
        );

        // Calculate trend
        const midpoint = Math.floor(deploymentPipelines.length / 2);
        const recentCount = deploymentPipelines.slice(0, midpoint).length;
        const olderCount = deploymentPipelines.slice(midpoint).length;
        const recentDays = days / 2;
        const recentRate = recentCount / recentDays;
        const olderRate = olderCount / recentDays;

        let trend: DeploymentFrequency['trend'] = 'stable';
        if (recentRate > olderRate * 1.2) trend = 'increasing';
        else if (recentRate < olderRate * 0.8) trend = 'decreasing';

        deploymentStats.push({
          project_name: project.name,
          total_deployments: deploymentPipelines.length,
          successful_deployments: successful,
          failed_deployments: failed,
          avg_deployment_time: avgTime,
          deployments_per_day: deploymentsPerDay,
          last_deployment: sortedDeployments[0]?.finished_at || '',
          trend,
        });
      } catch (error) {
        console.error(`Failed to get deployment stats for project ${project.id}:`, error);
      }
    }

    return deploymentStats.sort((a, b) => b.total_deployments - a.total_deployments);
  }
}

let gitlabApiInstance: GitLabAPI | null = null;
let cachedUrl: string | null = null;
let cachedToken: string | null = null;

export function getGitLabAPI(customUrl?: string, customToken?: string): GitLabAPI {
  const url = customUrl ||
               (typeof window !== 'undefined' ? localStorage.getItem('gitlab-dashboard-storage') : null) ||
               process.env.GITLAB_URL ||
               process.env.NEXT_PUBLIC_GITLAB_URL ||
               'https://gitlab.com';

  let token = customToken || process.env.GITLAB_TOKEN || process.env.NEXT_PUBLIC_GITLAB_TOKEN || '';

  // Try to get token from localStorage if in browser
  if (typeof window !== 'undefined' && !token) {
    try {
      const stored = localStorage.getItem('gitlab-dashboard-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        token = parsed.state?.gitlabToken || '';
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Recreate instance if URL or token changed
  if (!gitlabApiInstance || cachedUrl !== url || cachedToken !== token) {
    if (!token) {
      throw new Error('GitLab token not configured');
    }

    gitlabApiInstance = new GitLabAPI(url, token);
    cachedUrl = url;
    cachedToken = token;
  }

  return gitlabApiInstance;
}

export function resetGitLabAPI() {
  gitlabApiInstance = null;
  cachedUrl = null;
  cachedToken = null;
}

export default GitLabAPI;
