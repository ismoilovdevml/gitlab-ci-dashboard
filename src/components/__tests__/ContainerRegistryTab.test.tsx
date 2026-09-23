import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContainerRegistryTab from '../ContainerRegistryTab';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred, makeRepository } from '../__fixtures__/gitlab';
import type { ContainerRepository } from '@/lib/gitlab-api';

const mockApi = {
  getAllContainerRepositories: jest.fn(),
  getContainerTags: jest.fn(),
  deleteContainerRepository: jest.fn(),
};
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve(mockApi)),
}));

describe('ContainerRegistryTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ notifications: [] });
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
  });

  it('shows the loading state until the repositories arrive', async () => {
    const request = deferred<ContainerRepository[]>();
    mockApi.getAllContainerRepositories.mockReturnValue(request.promise);

    render(<ContainerRegistryTab />);
    expect(screen.getByText('Loading container registries...')).toBeInTheDocument();

    await act(async () => request.resolve([makeRepository({ id: 5, name: 'backend' })]));

    expect(await screen.findByText('backend')).toBeInTheDocument();
    expect(screen.queryByText('Loading container registries...')).not.toBeInTheDocument();
  });

  it('shows the empty state when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApi.getAllContainerRepositories.mockRejectedValue(new Error('boom'));

    render(<ContainerRegistryTab />);

    expect(await screen.findByText('No Container Registries Found')).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it('copies the pull command and notifies', async () => {
    mockApi.getAllContainerRepositories.mockResolvedValue([
      makeRepository({ id: 5, name: 'backend', location: 'registry.example.com/g/backend' }),
    ]);
    render(<ContainerRegistryTab />);

    fireEvent.click(await screen.findByTitle('Copy pull command'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('docker pull registry.example.com/g/backend');
    expect(useDashboardStore.getState().notifications).toEqual([
      expect.objectContaining({ type: 'success', title: 'Copied!', message: 'Pull command copied to clipboard' }),
    ]);
  });

  it('deletes a repository after confirmation', async () => {
    mockApi.getAllContainerRepositories.mockResolvedValue([
      makeRepository({ id: 5, name: 'backend', project_id: 3 }),
      makeRepository({ id: 6, name: 'frontend' }),
    ]);
    mockApi.deleteContainerRepository.mockResolvedValue(undefined);
    render(<ContainerRegistryTab />);

    fireEvent.click((await screen.findAllByTitle('Delete repository'))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('backend')).not.toBeInTheDocument());
    expect(mockApi.deleteContainerRepository).toHaveBeenCalledWith(3, 5);
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(useDashboardStore.getState().notifications).toEqual([
      expect.objectContaining({
        type: 'success',
        title: 'Repository Deleted',
        message: 'Successfully deleted repository "backend"',
      }),
    ]);
  });
});
