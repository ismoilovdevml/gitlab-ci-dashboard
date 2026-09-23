import { act, render, screen, fireEvent } from '@testing-library/react';
import PipelineListModal from '../PipelineListModal';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred, makePipeline, makeProject } from '../__fixtures__/gitlab';
import type { Pipeline } from '@/lib/gitlab-api';

const mockGetPipelines = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve({ getPipelines: mockGetPipelines })),
}));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('PipelineListModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ projects: [makeProject({ id: 1 }), makeProject({ id: 2 })] });
  });

  it('loads pipelines of every project, filtered by status and newest first', async () => {
    const first = deferred<Pipeline[]>();
    mockGetPipelines.mockImplementation((projectId: number) =>
      projectId === 1
        ? first.promise
        : Promise.resolve([
            makePipeline({ id: 21, project_id: 2, status: 'failed', updated_at: minutesAgo(1) }),
            makePipeline({ id: 22, project_id: 2, status: 'success', updated_at: minutesAgo(2) }),
          ])
    );

    render(<PipelineListModal title="Failed pipelines" status="failed" onClose={jest.fn()} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Loading pipelines...')).toBeInTheDocument();

    await act(async () =>
      first.resolve([makePipeline({ id: 11, project_id: 1, status: 'failed', updated_at: minutesAgo(30) })])
    );

    expect(await screen.findByText('2 pipelines')).toBeInTheDocument();
    const ids = screen.getAllByText(/^#\d+$/).map((el) => el.textContent);
    expect(ids).toEqual(['#21', '#11']);
    expect(mockGetPipelines).toHaveBeenCalledWith(1, 1, 20);
    expect(mockGetPipelines).toHaveBeenCalledWith(2, 1, 20);
  });

  it('filters the loaded pipelines by the search term without refetching', async () => {
    mockGetPipelines.mockImplementation((projectId: number) =>
      Promise.resolve(
        projectId === 1
          ? [makePipeline({ id: 11, project_id: 1, ref: 'main' })]
          : [makePipeline({ id: 21, project_id: 2, ref: 'feature/login' })]
      )
    );

    render(<PipelineListModal title="All pipelines" onClose={jest.fn()} />);
    expect(await screen.findByText('2 pipelines')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search by ID, branch, or commit...');
    fireEvent.change(search, { target: { value: 'feature' } });
    expect(screen.getByText('1 pipelines')).toBeInTheDocument();
    expect(screen.getByText('#21')).toBeInTheDocument();
    expect(screen.queryByText('#11')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'nothing-matches' } });
    expect(screen.getByText('No pipelines found')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('2 pipelines')).toBeInTheDocument();
    expect(mockGetPipelines).toHaveBeenCalledTimes(2);
  });
});
