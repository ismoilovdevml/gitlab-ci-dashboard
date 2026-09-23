import { act, render, screen, fireEvent } from '@testing-library/react';
import RunnerDetailsModal from '../RunnerDetailsModal';
import { deferred, makeJob, makeRunner } from '../__fixtures__/gitlab';
import type { Job } from '@/lib/gitlab-api';

const mockGetRunnerJobs = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve({ getRunnerJobs: mockGetRunnerJobs })),
}));

describe('RunnerDetailsModal', () => {
  const runner = makeRunner({ id: 7, description: 'docker-runner' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing and loads nothing while closed', () => {
    const { container } = render(<RunnerDetailsModal runner={null} isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockGetRunnerJobs).not.toHaveBeenCalled();
  });

  it('shows a spinner until the runner jobs are loaded', async () => {
    const request = deferred<Job[]>();
    mockGetRunnerJobs.mockReturnValue(request.promise);

    render(<RunnerDetailsModal runner={runner} isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /job history/i }));

    expect(screen.queryByText(/Recent Jobs/)).not.toBeInTheDocument();
    expect(screen.queryByText('No jobs found for this runner')).not.toBeInTheDocument();

    await act(async () => request.resolve([makeJob({ id: 1, name: 'unit-tests' })]));

    expect(await screen.findByText('Recent Jobs (1)')).toBeInTheDocument();
    expect(screen.getByText('unit-tests')).toBeInTheDocument();
    expect(mockGetRunnerJobs).toHaveBeenCalledWith(7, 1, 50);
  });

  it('reloads, with the spinner, every time it is reopened', async () => {
    mockGetRunnerJobs.mockResolvedValueOnce([]);
    const onClose = jest.fn();
    const { rerender } = render(<RunnerDetailsModal runner={runner} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /job history/i }));
    expect(await screen.findByText('No jobs found for this runner')).toBeInTheDocument();

    rerender(<RunnerDetailsModal runner={null} isOpen={false} onClose={onClose} />);

    const request = deferred<Job[]>();
    mockGetRunnerJobs.mockReturnValueOnce(request.promise);
    rerender(<RunnerDetailsModal runner={runner} isOpen onClose={onClose} />);

    // The tab choice survives; the stale "no jobs" state does not.
    expect(screen.queryByText('No jobs found for this runner')).not.toBeInTheDocument();
    await act(async () => request.resolve([makeJob({ id: 2, name: 'deploy' })]));

    expect(await screen.findByText('Recent Jobs (1)')).toBeInTheDocument();
    expect(mockGetRunnerJobs).toHaveBeenCalledTimes(2);
  });

  it('calls onClose from the close button', () => {
    mockGetRunnerJobs.mockResolvedValue([]);
    const onClose = jest.fn();
    render(<RunnerDetailsModal runner={runner} isOpen onClose={onClose} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
