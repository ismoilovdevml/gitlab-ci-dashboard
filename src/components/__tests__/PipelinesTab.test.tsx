import { act, render, screen, fireEvent } from '@testing-library/react';
import PipelinesTab from '../PipelinesTab';
import { useDashboardStore } from '@/store/dashboard-store';
import { makePipeline, makeProject } from '../__fixtures__/gitlab';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
}));

const mockGetProjects = jest.fn();
const mockGetPipelines = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() =>
    Promise.resolve({ getProjects: mockGetProjects, getPipelines: mockGetPipelines })
  ),
}));

const flush = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('PipelinesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useDashboardStore.setState({ projects: [] });
    mockGetProjects.mockResolvedValue([
      makeProject({ id: 1, name: 'web' }),
      makeProject({ id: 2, name: 'api' }),
    ]);
    mockGetPipelines.mockImplementation((projectId: number) =>
      Promise.resolve([
        makePipeline({ id: projectId * 10 + 1, project_id: projectId, status: 'success' }),
        makePipeline({ id: projectId * 10 + 2, project_id: projectId, status: 'failed' }),
      ])
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads projects, selects the first and loads its pipelines after the debounce', async () => {
    render(<PipelinesTab />);
    await flush();

    expect(mockGetProjects).toHaveBeenCalledWith(1, 50);
    expect(useDashboardStore.getState().projects).toHaveLength(2);
    expect(mockGetPipelines).not.toHaveBeenCalled();

    await flush(300);

    expect(mockGetPipelines).toHaveBeenCalledTimes(1);
    expect(mockGetPipelines).toHaveBeenCalledWith(1, 1, 20);
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
  });

  it('reloads for another project and ignores clicks on the selected one', async () => {
    render(<PipelinesTab />);
    await flush();
    await flush(300);
    expect(mockGetPipelines).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /web/ }));
    await flush(300);
    expect(mockGetPipelines).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /api/ }));
    await flush(300);
    expect(mockGetPipelines).toHaveBeenCalledTimes(2);
    expect(mockGetPipelines).toHaveBeenLastCalledWith(2, 1, 20);
    expect(screen.getByText('#21')).toBeInTheDocument();
  });

  it('applies the status filter through a debounced reload', async () => {
    render(<PipelinesTab />);
    await flush();
    await flush(300);

    fireEvent.change(screen.getByDisplayValue('All Status'), { target: { value: 'failed' } });
    fireEvent.change(screen.getByDisplayValue('Failed'), { target: { value: 'success' } });
    fireEvent.change(screen.getByDisplayValue('Success'), { target: { value: 'failed' } });
    await flush(300);

    // Three quick changes, one request.
    expect(mockGetPipelines).toHaveBeenCalledTimes(2);
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.queryByText('#11')).not.toBeInTheDocument();
  });

  it('applies the date range filter', async () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    mockGetPipelines.mockResolvedValue([
      makePipeline({ id: 11, project_id: 1 }),
      makePipeline({ id: 12, project_id: 1, created_at: old }),
    ]);
    render(<PipelinesTab />);
    await flush();
    await flush(300);
    expect(screen.getByText('#12')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Last 7 days'), { target: { value: '1' } });
    await flush(300);

    expect(mockGetPipelines).toHaveBeenCalledTimes(2);
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(screen.queryByText('#12')).not.toBeInTheDocument();
  });

  it('refreshes immediately from the refresh button', async () => {
    render(<PipelinesTab />);
    await flush();
    await flush(300);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await flush();

    expect(mockGetPipelines).toHaveBeenCalledTimes(2);
    expect(mockGetPipelines).toHaveBeenLastCalledWith(1, 1, 20);
  });
});
