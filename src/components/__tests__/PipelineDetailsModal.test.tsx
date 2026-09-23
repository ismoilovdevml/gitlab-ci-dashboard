import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import PipelineDetailsModal from '../PipelineDetailsModal';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred, makeJob, makePipeline } from '../__fixtures__/gitlab';
import type { Job } from '@/lib/gitlab-api';

const mockGetPipelineJobs = jest.fn();
const mockRetryJob = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() =>
    Promise.resolve({ getPipelineJobs: mockGetPipelineJobs, retryJob: mockRetryJob })
  ),
}));

describe('PipelineDetailsModal', () => {
  const pipeline = makePipeline({ id: 100, project_id: 1 });

  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ notifications: [] });
  });

  it('shows the loading state until the pipeline jobs arrive', async () => {
    const request = deferred<Job[]>();
    mockGetPipelineJobs.mockReturnValue(request.promise);

    render(<PipelineDetailsModal pipeline={pipeline} projectId={1} onClose={jest.fn()} />);

    expect(screen.getByText('Loading jobs...')).toBeInTheDocument();
    expect(screen.queryByText('No Jobs Found')).not.toBeInTheDocument();

    await act(async () => request.resolve([makeJob({ id: 1, name: 'compile', status: 'success' })]));

    expect(await screen.findByText('Pipeline Jobs (1)')).toBeInTheDocument();
    expect(screen.queryByText('Loading jobs...')).not.toBeInTheDocument();
    expect(mockGetPipelineJobs).toHaveBeenCalledWith(1, 100);
  });

  it('shows the empty state when the pipeline has no jobs or the request fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetPipelineJobs.mockRejectedValue(new Error('boom'));

    render(<PipelineDetailsModal pipeline={pipeline} projectId={1} onClose={jest.fn()} />);

    expect(await screen.findByText('No Jobs Found')).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it('reloads the jobs, with the loading state, after a job is retried', async () => {
    mockGetPipelineJobs.mockResolvedValueOnce([makeJob({ id: 1, name: 'compile', status: 'failed' })]);
    mockRetryJob.mockResolvedValue({});

    render(<PipelineDetailsModal pipeline={pipeline} projectId={1} onClose={jest.fn()} />);
    expect(await screen.findByText('Pipeline Jobs (1)')).toBeInTheDocument();

    const reload = deferred<Job[]>();
    mockGetPipelineJobs.mockReturnValueOnce(reload.promise);
    fireEvent.click(screen.getByTitle('Retry job'));

    await waitFor(() => expect(mockRetryJob).toHaveBeenCalledWith(1, 1));
    expect(await screen.findByText('Loading jobs...')).toBeInTheDocument();

    await act(async () =>
      reload.resolve([
        makeJob({ id: 1, name: 'compile', status: 'running' }),
        makeJob({ id: 2, name: 'lint', status: 'success' }),
      ])
    );

    expect(await screen.findByText('Pipeline Jobs (2)')).toBeInTheDocument();
    expect(mockGetPipelineJobs).toHaveBeenCalledTimes(2);
    expect(useDashboardStore.getState().notifications[0]).toMatchObject({
      type: 'success',
      title: 'Job Retrying',
    });
  });
});
