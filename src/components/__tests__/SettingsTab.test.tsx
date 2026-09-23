import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import SettingsTab from '../SettingsTab';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', card: '', textPrimary: '', textSecondary: '' }),
}));

const mockNotifySuccess = jest.fn();
const mockNotifyError = jest.fn();
jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifySuccess: mockNotifySuccess,
    notifyError: mockNotifyError,
    notifyInfo: jest.fn(),
  }),
}));

jest.mock('@/store/dashboard-store', () => ({
  useDashboardStore: () => ({
    theme: 'dark',
    setTheme: jest.fn(),
    setAutoRefresh: jest.fn(),
    setRefreshInterval: jest.fn(),
    setNotifyPipelineFailures: jest.fn(),
    setNotifyPipelineSuccess: jest.fn(),
  }),
}));

jest.mock('@/lib/api/csrf-client', () => ({
  withCsrf: <T,>(request: (headers: Record<string, string>) => Promise<T>) =>
    request({ 'x-csrf-token': 'csrf-test' }),
  clearCsrfToken: jest.fn(),
}));

jest.mock('axios', () => {
  const isAxiosError = (e: unknown) => Boolean((e as { isAxiosError?: boolean } | null)?.isAxiosError);
  return {
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), isAxiosError },
    isAxiosError,
  };
});

const mockGet = axios.get as jest.Mock;
const mockPost = axios.post as jest.Mock;

function mockSession(user: Record<string, unknown>) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/auth/session') {
      return Promise.resolve({ data: { authenticated: true, user } });
    }
    if (url === '/api/version') {
      return Promise.resolve({ data: { currentVersion: '1.0.0' } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('SettingsTab GitLab configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('saves with a blank token when one is stored, and lets the server test the connection', async () => {
    mockSession({ username: 'admin', gitlabUrl: 'https://gitlab.example.com', gitlabToken: '***' });
    mockPost.mockResolvedValue({ data: { tokenConfigured: true, gitlabUsername: 'root' } });

    render(<SettingsTab />);

    const tokenInput = await screen.findByPlaceholderText('Saved (leave blank to keep)');
    expect(tokenInput).toHaveValue('');
    expect(screen.getByLabelText('GitLab URL')).toHaveValue('https://gitlab.example.com');

    const save = screen.getByRole('button', { name: /test & save/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/api/config');
    expect(body).toMatchObject({ url: 'https://gitlab.example.com', token: '' });
    expect(config.headers).toEqual({ 'x-csrf-token': 'csrf-test' });

    await waitFor(() => expect(mockNotifySuccess).toHaveBeenCalledWith('Configuration Saved', 'Connected as root'));

    // No request from the browser to the GitLab host.
    const requested = mockGet.mock.calls.map(([u]) => u);
    expect(requested.every((u: string) => u.startsWith('/api/'))).toBe(true);
  });

  it('requires a token when none is stored', async () => {
    mockSession({ username: 'admin', gitlabUrl: 'https://gitlab.example.com', gitlabToken: '' });

    render(<SettingsTab />);

    await screen.findByPlaceholderText('glpat-xxxxxxxxxxxxx');
    const save = screen.getByRole('button', { name: /test & save/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Access Token'), { target: { value: 'glpat-new' } });
    expect(save).toBeEnabled();
  });

  it('shows the server error when the connection test fails', async () => {
    mockSession({ username: 'admin', gitlabUrl: 'https://gitlab.example.com', gitlabToken: '' });
    mockPost.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { error: 'Invalid token' } } });

    render(<SettingsTab />);

    await screen.findByPlaceholderText('glpat-xxxxxxxxxxxxx');
    fireEvent.change(screen.getByLabelText('Access Token'), { target: { value: 'glpat-wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /test & save/i }));

    await waitFor(() => expect(mockNotifyError).toHaveBeenCalledWith('Connection Failed', 'Invalid token'));
    expect(mockNotifySuccess).not.toHaveBeenCalled();
  });
});
