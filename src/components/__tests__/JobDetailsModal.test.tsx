import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import JobDetailsModal from '../JobDetailsModal';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred, makeJob } from '../__fixtures__/gitlab';
import type { Job } from '@/lib/gitlab-api';

const mockGetPipelineJobs = jest.fn();
const mockGetJobTrace = jest.fn();
const mockRetryJob = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() =>
    Promise.resolve({
      getPipelineJobs: mockGetPipelineJobs,
      getJobTrace: mockGetJobTrace,
      retryJob: mockRetryJob,
    })
  ),
}));

describe('JobDetailsModal', () => {
  const job = makeJob({ id: 42, name: 'build', status: 'success', pipeline: { id: 100, project_id: 1, ref: 'main', sha: 'abc', status: 'success' } });

  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ projects: [], notifications: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the pipeline stages with a spinner', async () => {
    const request = deferred<Job[]>();
    mockGetPipelineJobs.mockReturnValue(request.promise);

    render(<JobDetailsModal job={job} projectId={1} onClose={jest.fn()} />);

    expect(screen.queryByText('No pipeline jobs found')).not.toBeInTheDocument();
    await act(async () => request.resolve([]));

    expect(await screen.findByText('No pipeline jobs found')).toBeInTheDocument();
    expect(mockGetPipelineJobs).toHaveBeenCalledWith(1, 100);
  });

  it('loads the logs once, the first time the logs tab is opened', async () => {
    mockGetPipelineJobs.mockResolvedValue([]);
    const trace = deferred<string>();
    mockGetJobTrace.mockReturnValue(trace.promise);

    render(<JobDetailsModal job={job} projectId={1} onClose={jest.fn()} />);
    await screen.findByText('No pipeline jobs found');
    expect(mockGetJobTrace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /job logs/i }));
    expect(screen.getByText('Loading logs...')).toBeInTheDocument();

    await act(async () => trace.resolve('$ make build\nBuild complete'));
    expect(await screen.findByText('Build complete')).toBeInTheDocument();
    expect(screen.getByText('2 lines')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pipeline stages/i }));
    fireEvent.click(screen.getByRole('button', { name: /job logs/i }));
    expect(screen.getByText('Build complete')).toBeInTheDocument();
    expect(mockGetJobTrace).toHaveBeenCalledTimes(1);
    expect(mockGetJobTrace).toHaveBeenCalledWith(1, 42);
  });

  it('shows a message when the logs cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetPipelineJobs.mockResolvedValue([]);
    mockGetJobTrace.mockRejectedValue(new Error('404'));

    render(<JobDetailsModal job={job} projectId={1} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /job logs/i }));

    expect(await screen.findByText(/Failed to load logs/)).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it('polls the logs of a running job every 3 seconds', async () => {
    jest.useFakeTimers();
    const running = makeJob({ ...job, status: 'running' });
    mockGetPipelineJobs.mockResolvedValue([]);
    mockGetJobTrace.mockResolvedValueOnce('line 1').mockResolvedValue('line 1\nline 2');

    render(<JobDetailsModal job={running} projectId={1} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /job logs/i }));
    expect(await screen.findByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('Live updating every 3s')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(await screen.findByText('line 2')).toBeInTheDocument();
    expect(mockGetJobTrace).toHaveBeenCalledTimes(2);
  });

  it('reloads the pipeline stages a second after retrying a job', async () => {
    jest.useFakeTimers();
    mockGetPipelineJobs.mockResolvedValueOnce([makeJob({ id: 43, name: 'test', status: 'failed' })]);
    mockRetryJob.mockResolvedValue({});

    render(<JobDetailsModal job={job} projectId={1} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByTitle('Retry job'));
    await waitFor(() => expect(mockRetryJob).toHaveBeenCalledWith(1, 43));
    expect(useDashboardStore.getState().notifications[0]).toMatchObject({ title: 'Job Retrying' });

    mockGetPipelineJobs.mockResolvedValueOnce([]);
    expect(mockGetPipelineJobs).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(await screen.findByText('No pipeline jobs found')).toBeInTheDocument();
    expect(mockGetPipelineJobs).toHaveBeenCalledTimes(2);
  });
});
