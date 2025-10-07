import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { logger } from './logger';
import { cacheWithTTL, invalidateCacheByTag } from './cache';

export interface GitLabConfig {
  url: string;
  token: string;
}

export interface GitLabClientOptions {
  cache?: boolean;
  cacheTTL?: number;
}

/**
 * GitLab API Client - Centralized API calls with caching and error handling
 */
export class GitLabClient {
  private client: AxiosInstance;
  private config: GitLabConfig;

  constructor(config: GitLabConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.url}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('GitLab API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('GitLab API Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('GitLab API Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleError(error: AxiosError): void {
    if (error.response) {
      logger.error('GitLab API Error', {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
        data: error.response.data,
      });
    } else if (error.request) {
      logger.error('GitLab API No Response', {
        url: error.config?.url,
      });
    } else {
      logger.error('GitLab API Request Setup Error', {
        message: error.message,
      });
    }
  }

  /**
   * Make GET request with optional caching
   */
  async get<T>(
    endpoint: string,
    options: GitLabClientOptions & AxiosRequestConfig = {}
  ): Promise<T> {
    const { cache = false, cacheTTL = 300, ...axiosConfig } = options;

    if (cache) {
      return cacheWithTTL(
        `gitlab:${endpoint}:${JSON.stringify(axiosConfig.params || {})}`,
        async () => {
          const response = await this.client.get<T>(endpoint, axiosConfig);
          return response.data;
        },
        {
          ttl: cacheTTL,
          prefix: 'gitlab',
          tags: [this.extractResourceTag(endpoint)],
        }
      );
    }

    const response = await this.client.get<T>(endpoint, axiosConfig);
    return response.data;
  }

  /**
   * Make POST request
   */
  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    // Invalidate cache for this resource
    await this.invalidateCache(endpoint);

    const response = await this.client.post<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Make PUT request
   */
  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    // Invalidate cache for this resource
    await this.invalidateCache(endpoint);

    const response = await this.client.put<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Make DELETE request
   */
  async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    // Invalidate cache for this resource
    await this.invalidateCache(endpoint);

    const response = await this.client.delete<T>(endpoint, config);
    return response.data;
  }

  /**
   * Extract resource tag from endpoint for cache invalidation
   */
  private extractResourceTag(endpoint: string): string {
    const parts = endpoint.split('/').filter(Boolean);
    return parts[0] || 'general';
  }

  /**
   * Invalidate cache for resource
   */
  private async invalidateCache(endpoint: string): Promise<void> {
    const tag = this.extractResourceTag(endpoint);
    await invalidateCacheByTag(tag, 'gitlab');
  }

  // ==========================================
  // Projects API
  // ==========================================

  async getProjects(params?: {
    membership?: boolean;
    per_page?: number;
    page?: number;
    order_by?: string;
    sort?: string;
  }): Promise<unknown[]> {
    return this.get('/projects', {
      params: {
        membership: true,
        per_page: 20,
        order_by: 'last_activity_at',
        sort: 'desc',
        ...params,
      },
      cache: true,
      cacheTTL: 300, // 5 minutes
    });
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.get(`/projects/${projectId}`, {
      cache: true,
      cacheTTL: 600, // 10 minutes
    });
  }

  // ==========================================
  // Pipelines API
  // ==========================================

  async getPipelines(
    projectId: number,
    params?: {
      per_page?: number;
      page?: number;
      status?: string;
      ref?: string;
    }
  ): Promise<unknown[]> {
    return this.get(`/projects/${projectId}/pipelines`, {
      params: {
        per_page: 20,
        ...params,
      },
      cache: true,
      cacheTTL: 60, // 1 minute
    });
  }

  async getPipeline(projectId: number, pipelineId: number): Promise<unknown> {
    return this.get(`/projects/${projectId}/pipelines/${pipelineId}`, {
      cache: true,
      cacheTTL: 30, // 30 seconds
    });
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<unknown[]> {
    return this.get(`/projects/${projectId}/pipelines/${pipelineId}/jobs`, {
      cache: true,
      cacheTTL: 30,
    });
  }

  async retryPipeline(projectId: number, pipelineId: number): Promise<unknown> {
    return this.post(`/projects/${projectId}/pipelines/${pipelineId}/retry`);
  }

  async cancelPipeline(projectId: number, pipelineId: number): Promise<unknown> {
    return this.post(`/projects/${projectId}/pipelines/${pipelineId}/cancel`);
  }

  // ==========================================
  // Jobs API
  // ==========================================

  async getJob(projectId: number, jobId: number): Promise<unknown> {
    return this.get(`/projects/${projectId}/jobs/${jobId}`, {
      cache: true,
      cacheTTL: 30,
    });
  }

  async getJobLog(projectId: number, jobId: number): Promise<string> {
    return this.get(`/projects/${projectId}/jobs/${jobId}/trace`, {
      cache: false,
    });
  }

  async retryJob(projectId: number, jobId: number): Promise<unknown> {
    return this.post(`/projects/${projectId}/jobs/${jobId}/retry`);
  }

  async cancelJob(projectId: number, jobId: number): Promise<unknown> {
    return this.post(`/projects/${projectId}/jobs/${jobId}/cancel`);
  }

  // ==========================================
  // Runners API
  // ==========================================

  async getRunners(params?: {
    type?: string;
    status?: string;
    per_page?: number;
  }): Promise<unknown[]> {
    return this.get('/runners/all', {
      params: {
        per_page: 50,
        ...params,
      },
      cache: true,
      cacheTTL: 120, // 2 minutes
    });
  }

  async getRunner(runnerId: number): Promise<unknown> {
    return this.get(`/runners/${runnerId}`, {
      cache: true,
      cacheTTL: 300,
    });
  }

  // ==========================================
  // User API
  // ==========================================

  async getCurrentUser(): Promise<unknown> {
    return this.get('/user', {
      cache: true,
      cacheTTL: 600,
    });
  }

  // ==========================================
  // Health Check
  // ==========================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/version', { cache: false });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create GitLab client instance
 */
export function createGitLabClient(config: GitLabConfig): GitLabClient {
  return new GitLabClient(config);
}

/**
 * Singleton instance (optional)
 */
let defaultClient: GitLabClient | null = null;

export function getDefaultGitLabClient(config?: GitLabConfig): GitLabClient {
  if (!defaultClient && config) {
    defaultClient = new GitLabClient(config);
  }

  if (!defaultClient) {
    throw new Error('GitLab client not initialized');
  }

  return defaultClient;
}
