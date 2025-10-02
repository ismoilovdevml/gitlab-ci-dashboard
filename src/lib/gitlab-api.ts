import axios, { AxiosInstance } from 'axios';

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
    const response = await this.api.get('/projects', {
      params: {
        membership: true,
        order_by: 'last_activity_at',
        per_page: perPage,
        page,
      },
    });
    return response.data;
  }

  async getProject(projectId: number): Promise<Project> {
    const response = await this.api.get(`/projects/${projectId}`);
    return response.data;
  }

  // Pipelines
  async getPipelines(projectId: number, page = 1, perPage = 20): Promise<Pipeline[]> {
    const response = await this.api.get(`/projects/${projectId}/pipelines`, {
      params: {
        per_page: perPage,
        page,
        order_by: 'updated_at',
      },
    });
    return response.data;
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
    const response = await this.api.get('/runners/all', {
      params: {
        per_page: perPage,
        page,
      },
    });
    return response.data;
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
    } catch (e) {
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
