import { act, render, screen } from '@testing-library/react';
import ProjectDetailsModal from '../ProjectDetailsModal';
import { deferred, makePipeline, makeProject } from '../__fixtures__/gitlab';
import type { Pipeline } from '@/lib/gitlab-api';

const mockGetPipelines = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve({ getPipelines: mockGetPipelines })),
}));

describe('ProjectDetailsModal', () => {
  const project = makeProject({ id: 3, name: 'api' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the loading state, then the pipelines and their stats', async () => {
    const request = deferred<Pipeline[]>();
    mockGetPipelines.mockReturnValue(request.promise);

    render(<ProjectDetailsModal project={project} onClose={jest.fn()} />);

    expect(screen.getByText('Loading pipelines...')).toBeInTheDocument();
    expect(screen.queryByText('No pipelines found')).not.toBeInTheDocument();

    await act(async () =>
      request.resolve([
        makePipeline({ id: 11, project_id: 3, status: 'success' }),
        makePipeline({ id: 12, project_id: 3, status: 'failed' }),
        makePipeline({ id: 13, project_id: 3, status: 'running' }),
      ])
    );

    expect(await screen.findByText('Recent Pipelines (3)')).toBeInTheDocument();
    expect(screen.queryByText('Loading pipelines...')).not.toBeInTheDocument();
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(mockGetPipelines).toHaveBeenCalledWith(3, 1, 50);
  });

  it('shows the empty state when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetPipelines.mockRejectedValue(new Error('boom'));

    render(<ProjectDetailsModal project={project} onClose={jest.fn()} />);

    expect(await screen.findByText('No pipelines found')).toBeInTheDocument();
    jest.restoreAllMocks();
  });
});
