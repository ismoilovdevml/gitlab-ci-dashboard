import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ArtifactsTab from '../ArtifactsTab';

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', card: '', textPrimary: '', textSecondary: '' }),
}));

const mockNotifyError = jest.fn();
jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ notifySuccess: jest.fn(), notifyError: mockNotifyError }),
}));

jest.mock('@/store/dashboard-store', () => ({
  useDashboardStore: () => ({}),
}));

const mockGetAllArtifacts = jest.fn();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() => Promise.resolve({ getAllArtifacts: mockGetAllArtifacts })),
}));

const artifactJob = {
  id: 42,
  name: 'build',
  status: 'success',
  ref: 'main',
  created_at: new Date().toISOString(),
  commit: { short_id: 'abc123', title: 'Build', author_name: 'dev' },
  project: { id: 7, name: 'app', name_with_namespace: 'group / app' },
  pipeline: { id: 1, project_id: 7, ref: 'main', sha: 'abc', status: 'success' },
  artifacts_file: { filename: 'artifacts.zip', size: 1024 },
  web_url: 'https://gitlab.example.com/group/app/-/jobs/42',
};

describe('ArtifactsTab loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the loading state until artifacts arrive, then lists them', async () => {
    let resolve!: (value: unknown[]) => void;
    mockGetAllArtifacts.mockReturnValue(new Promise((res) => { resolve = res; }));

    render(<ArtifactsTab />);
    expect(screen.getByText('Loading artifacts...')).toBeInTheDocument();

    await act(async () => resolve([artifactJob]));

    expect(await screen.findByTitle('Download artifacts')).toBeInTheDocument();
    expect(screen.queryByText('Loading artifacts...')).not.toBeInTheDocument();
    expect(mockGetAllArtifacts).toHaveBeenCalledTimes(1);
  });

  it('notifies and shows the empty state when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetAllArtifacts.mockRejectedValue(new Error('boom'));

    render(<ArtifactsTab />);

    expect(await screen.findByText('No Artifacts Found')).toBeInTheDocument();
    expect(mockNotifyError).toHaveBeenCalledWith('Load Failed', 'Failed to load artifacts');
    jest.restoreAllMocks();
  });
});

describe('ArtifactsTab download', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllArtifacts.mockResolvedValue([artifactJob]);
    window.URL.createObjectURL = jest.fn(() => 'blob:artifact');
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('downloads through the server route without sending GitLab credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['zip'])),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ArtifactsTab />);

    fireEvent.click(await screen.findByTitle('Download artifacts'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/artifacts/download?projectId=7&jobId=42&filename=artifacts.zip');

    const headerNames = Array.from(new Headers(init?.headers).keys());
    expect(headerNames).not.toContain('x-gitlab-token');
    expect(headerNames).not.toContain('x-gitlab-url');
    expect(headerNames).not.toContain('private-token');
    expect(mockNotifyError).not.toHaveBeenCalled();
  });
});
