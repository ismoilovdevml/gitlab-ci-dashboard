import { act, render, screen } from '@testing-library/react';
import Overview from '../Overview';
import { useDashboardStore } from '@/store/dashboard-store';
import { makeJob, makePipeline, makeProject } from '../__fixtures__/gitlab';

const mockApi = {
  getProjects: jest.fn(),
  getAllActivePipelines: jest.fn(),
  getPipelineStats: jest.fn(),
  getPipelines: jest.fn(),
  getPipelineJobs: jest.fn(),
};
const mockGetGitLabAPIAsync = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: () => mockGetGitLabAPIAsync(),
}));

const flush = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('Overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useDashboardStore.setState({
      projects: [],
      activePipelines: [],
      stats: null,
      error: null,
      isLoading: false,
      autoRefresh: true,
      refreshInterval: 10000,
    });
    mockGetGitLabAPIAsync.mockResolvedValue(mockApi);
    mockApi.getProjects.mockResolvedValue([makeProject({ id: 1, name: 'web' })]);
    mockApi.getAllActivePipelines.mockResolvedValue([makePipeline({ id: 100, project_id: 1, status: 'running' })]);
    mockApi.getPipelineStats.mockResolvedValue({ total: 9, running: 1, pending: 0, success: 7, failed: 1, canceled: 0 });
    mockApi.getPipelines.mockResolvedValue([makePipeline({ id: 100, project_id: 1, ref: 'release-1', status: 'running' })]);
    mockApi.getPipelineJobs.mockResolvedValue([
      makeJob({ id: 1, name: 'deploy-prod', status: 'running', pipeline: { id: 100, project_id: 1, ref: 'main', sha: 'a', status: 'running' } }),
      makeJob({ id: 2, name: 'finished-job', status: 'success' }),
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads projects, stats, recent pipelines and active jobs', async () => {
    render(<Overview />);
    await flush();

    const state = useDashboardStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.activePipelines).toHaveLength(1);
    expect(state.stats?.total).toBe(9);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();

    expect(screen.getByText('deploy-prod')).toBeInTheDocument();
    expect(screen.queryByText('finished-job')).not.toBeInTheDocument();
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(mockApi.getPipelines).toHaveBeenCalledWith(1, 1, 10);
    expect(mockApi.getPipelineJobs).toHaveBeenCalledWith(1, 100);
  });

  it('polls at the configured interval while auto refresh is on, and stops on unmount', async () => {
    const { unmount } = render(<Overview />);
    await flush();
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(1);

    await flush(10000);
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(2);

    await flush(10000);
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(3);

    unmount();
    await flush(30000);
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(3);
  });

  it('loads once without polling when auto refresh is off', async () => {
    useDashboardStore.setState({ autoRefresh: false });
    render(<Overview />);
    await flush();
    await flush(60000);

    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(1);
  });

  it('restarts polling when the interval changes', async () => {
    render(<Overview />);
    await flush();
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(1);

    await act(async () => {
      useDashboardStore.setState({ refreshInterval: 5000 });
    });
    await flush();
    // Changing the interval reloads right away, then every 5s.
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(2);

    await flush(5000);
    expect(mockApi.getPipelineStats).toHaveBeenCalledTimes(3);
  });

  it('stores the error message when loading fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockGetGitLabAPIAsync.mockRejectedValue(new Error('GitLab unreachable'));

    render(<Overview />);
    await flush();

    expect(useDashboardStore.getState().error).toBe('GitLab unreachable');
    expect(useDashboardStore.getState().isLoading).toBe(false);
    jest.restoreAllMocks();
  });
});
