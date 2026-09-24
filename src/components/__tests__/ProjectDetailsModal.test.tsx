import { act, render, screen, within } from '@testing-library/react';
import ProjectDetailsModal from '../ProjectDetailsModal';
import { deferred, makePipeline, makeProject } from '../__fixtures__/gitlab';
import type { Pipeline } from '@/lib/gitlab-api';

const mockGetPipelinePage = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve({ getPipelinePage: mockGetPipelinePage })),
}));

function page(pipelines: Pipeline[], total: number | null, nextPage: number | null = null) {
  return { pipelines, total, nextPage, page: 1, perPage: 50, totalPages: null };
}

function pipelinesCard(): HTMLElement {
  return screen.getByText('Pipelines').parentElement!.parentElement as HTMLElement;
}

describe('ProjectDetailsModal', () => {
  const project = makeProject({ id: 3, name: 'api' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the loading state, then the pipelines and their stats', async () => {
    const request = deferred<ReturnType<typeof page>>();
    mockGetPipelinePage.mockReturnValue(request.promise);

    render(<ProjectDetailsModal project={project} onClose={jest.fn()} />);

    expect(screen.getByText('Loading pipelines...')).toBeInTheDocument();
    expect(screen.queryByText('No pipelines found')).not.toBeInTheDocument();

    await act(async () =>
      request.resolve(
        page(
          [
            makePipeline({ id: 11, project_id: 3, status: 'success' }),
            makePipeline({ id: 12, project_id: 3, status: 'failed' }),
            makePipeline({ id: 13, project_id: 3, status: 'running' }),
          ],
          1234
        )
      )
    );

    expect(await screen.findByText('Recent Pipelines (3)')).toBeInTheDocument();
    expect(screen.queryByText('Loading pipelines...')).not.toBeInTheDocument();
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(mockGetPipelinePage).toHaveBeenCalledWith(3, { perPage: 50 });
    expect(within(pipelinesCard()).getByText((1234).toLocaleString())).toBeInTheDocument();
  });

  it('shows a dash for the pipeline total when GitLab omits it on a partial page', async () => {
    mockGetPipelinePage.mockResolvedValue(page([makePipeline({ id: 11, project_id: 3 })], null, 2));

    render(<ProjectDetailsModal project={project} onClose={jest.fn()} />);

    expect(await screen.findByText('Recent Pipelines (1)')).toBeInTheDocument();
    expect(within(pipelinesCard()).getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetPipelinePage.mockRejectedValue(new Error('boom'));

    render(<ProjectDetailsModal project={project} onClose={jest.fn()} />);

    expect(await screen.findByText('No pipelines found')).toBeInTheDocument();
    jest.restoreAllMocks();
  });
});
