import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectsTab from '../ProjectsTab';
import { useDashboardStore } from '@/store/dashboard-store';
import { makeProject } from '../__fixtures__/gitlab';

const mockApi = {
  getProjects: jest.fn(),
  getPipelines: jest.fn(),
};
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve(mockApi)),
}));

describe('ProjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ projects: [] });
    mockApi.getProjects.mockResolvedValue([
      makeProject({ id: 1, name: 'web', visibility: 'public' }),
      makeProject({ id: 2, name: 'api', visibility: 'private' }),
    ]);
    mockApi.getPipelines.mockResolvedValue([]);
  });

  it('loads projects into the store once on mount', async () => {
    render(<ProjectsTab />);

    expect(await screen.findByText('web')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(mockApi.getProjects).toHaveBeenCalledTimes(1);
    expect(mockApi.getProjects).toHaveBeenCalledWith(1, 50);
    expect(useDashboardStore.getState().projects).toHaveLength(2);
  });

  it('keeps the current projects when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useDashboardStore.setState({ projects: [makeProject({ id: 9, name: 'cached' })] });
    mockApi.getProjects.mockRejectedValue(new Error('down'));

    render(<ProjectsTab />);

    await waitFor(() => expect(mockApi.getProjects).toHaveBeenCalled());
    expect(screen.getByText('cached')).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it('opens the project details, which load its pipelines', async () => {
    render(<ProjectsTab />);

    fireEvent.click(await screen.findByText('api'));

    await waitFor(() => expect(mockApi.getPipelines).toHaveBeenCalledWith(2, 1, 50));
  });
});
