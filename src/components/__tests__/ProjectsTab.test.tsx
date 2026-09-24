import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProjectsTab from '../ProjectsTab';
import { useDashboardStore } from '@/store/dashboard-store';
import { makeProject } from '../__fixtures__/gitlab';

const mockApi = {
  getProjects: jest.fn(),
  getPipelines: jest.fn(),
  getPipelinePage: jest.fn(),
  getProjectRefCounts: jest.fn(),
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
    mockApi.getPipelinePage.mockResolvedValue({ pipelines: [], total: 0, nextPage: null });
    mockApi.getProjectRefCounts.mockImplementation((id: number) =>
      Promise.resolve(id === 1 ? { branches: 14, tags: 3 } : { branches: null, tags: 0 })
    );
  });

  function countFor(projectName: string, label: 'Branches' | 'Tags' | 'Commits'): string | null {
    const card = screen.getByText(projectName).closest('.rounded-2xl') as HTMLElement;
    return within(card).getByText(label).nextElementSibling?.textContent ?? null;
  }

  it('shows real branch and tag counts per project, or a dash when GitLab omits them', async () => {
    render(<ProjectsTab />);
    await screen.findByText('web');

    await waitFor(() => expect(countFor('web', 'Branches')).toBe('14'));
    expect(countFor('web', 'Tags')).toBe('3');
    expect(countFor('api', 'Branches')).toBe('—');
    expect(countFor('api', 'Tags')).toBe('0');
    expect(countFor('api', 'Commits')).toBe('—');
    expect(mockApi.getProjectRefCounts).toHaveBeenCalledTimes(2);
    expect(mockApi.getProjectRefCounts).toHaveBeenCalledWith(1);
    expect(mockApi.getProjectRefCounts).toHaveBeenCalledWith(2);
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

    await waitFor(() => expect(mockApi.getPipelinePage).toHaveBeenCalledWith(2, { perPage: 50 }));
  });
});
