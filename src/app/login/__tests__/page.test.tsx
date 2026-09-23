import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import LoginPage from '../page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { authenticated: false } });
  });

  it('renders the form in its final, visible state', async () => {
    render(<LoginPage />);

    const username = screen.getByLabelText(/username/i);
    const card = username.closest('form')?.parentElement as HTMLElement;
    expect(card.className).toContain('opacity-100');
    expect(card.className).toContain('starting:opacity-0');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/auth/session'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard when a session already exists', async () => {
    mockGet.mockResolvedValue({ data: { authenticated: true } });

    render(<LoginPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('logs in and redirects', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<LoginPage />);

    const submit = screen.getByRole('button', { name: /sign in/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(mockPost).toHaveBeenCalledWith('/api/auth/login', { username: 'admin', password: 'secret' });
  });

  it('shows the server error when login fails', async () => {
    mockPost.mockRejectedValue({ isAxiosError: true, response: { data: { error: 'Invalid credentials' } } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
