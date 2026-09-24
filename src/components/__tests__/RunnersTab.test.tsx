import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import RunnersTab from '../RunnersTab';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred, makeRunner } from '../__fixtures__/gitlab';
import type { Runner } from '@/lib/gitlab-api';

const mockGetRunners = jest.fn();
const mockGetRunnerJobs = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() =>
    Promise.resolve({ getRunners: mockGetRunners, getRunnerJobs: mockGetRunnerJobs })
  ),
}));

describe('RunnersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useDashboardStore.setState({ runners: [] });
    mockGetRunnerJobs.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the loading state until runners arrive, then lists them', async () => {
    const request = deferred<Runner[]>();
    mockGetRunners.mockReturnValue(request.promise);

    render(<RunnersTab />);

    expect(screen.getByText('Loading runners...')).toBeInTheDocument();
    expect(screen.queryByText('No runners found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();

    await act(async () => request.resolve([makeRunner({ id: 7, description: 'docker-runner' })]));

    expect(await screen.findAllByText('docker-runner')).not.toHaveLength(0);
    expect(screen.queryByText('Loading runners...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeEnabled();
    expect(mockGetRunners).toHaveBeenCalledWith(1, 100, { force: false });
    expect(useDashboardStore.getState().runners).toHaveLength(1);
  });

  it('shows the error returned by the API', async () => {
    mockGetRunners.mockRejectedValue(new Error('403 Forbidden'));

    render(<RunnersTab />);

    expect(await screen.findByText('403 Forbidden')).toBeInTheDocument();
    expect(screen.getByText('No runners found')).toBeInTheDocument();
  });

  it('refreshes on demand, clearing a previous error', async () => {
    mockGetRunners.mockRejectedValueOnce(new Error('timeout'));
    render(<RunnersTab />);
    expect(await screen.findByText('timeout')).toBeInTheDocument();

    const request = deferred<Runner[]>();
    mockGetRunners.mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(screen.queryByText('timeout')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();

    await act(async () => request.resolve([makeRunner({ description: 'fresh-runner' })]));

    expect(await screen.findAllByText('fresh-runner')).not.toHaveLength(0);
    expect(mockGetRunners).toHaveBeenCalledTimes(2);
    expect(mockGetRunners).toHaveBeenLastCalledWith(1, 100, { force: true });
  });

  it('opens the runner details and loads its jobs', async () => {
    mockGetRunners.mockResolvedValue([makeRunner({ id: 7, description: 'docker-runner' })]);
    render(<RunnersTab />);

    const [row] = await screen.findAllByText('docker-runner');
    fireEvent.click(row);

    await waitFor(() => expect(mockGetRunnerJobs).toHaveBeenCalledWith(7, 1, 50));
  });
});
