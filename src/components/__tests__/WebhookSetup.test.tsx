import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WebhookSetup from '../WebhookSetup';

const mockAddNotification = jest.fn();

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', card: '', textPrimary: '', textSecondary: '' }),
}));

jest.mock('@/store/dashboard-store', () => ({
  useDashboardStore: () => ({ addNotification: mockAddNotification }),
}));

const ORG_URL = 'https://ci.example.com/api/webhook/gitlab?org=org123';
const SECRET = 'a'.repeat(64);

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('WebhookSetup', () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('shows the org URL and keeps the secret hidden until revealed', async () => {
    mockFetch(200, { url: ORG_URL, secret: SECRET, scope: 'organization', organizationId: 'org123' });

    render(<WebhookSetup />);

    expect(await screen.findByLabelText('Webhook URL')).toHaveValue(ORG_URL);
    expect(global.fetch).toHaveBeenCalledWith('/api/webhook/setup', { cache: 'no-store' });

    const secretInput = screen.getByLabelText('Secret token');
    expect(secretInput).not.toHaveValue(SECRET);
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret' }));
    expect(secretInput).toHaveValue(SECRET);

    fireEvent.click(screen.getByRole('button', { name: 'Hide secret' }));
    expect(secretInput).not.toHaveValue(SECRET);
  });

  it('copies the URL and the secret without revealing it', async () => {
    mockFetch(200, { url: ORG_URL, secret: SECRET, scope: 'organization', organizationId: 'org123' });

    render(<WebhookSetup />);
    await screen.findByLabelText('Webhook URL');

    fireEvent.click(screen.getByRole('button', { name: 'Copy webhook URL' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ORG_URL));

    fireEvent.click(screen.getByRole('button', { name: 'Copy secret token' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(screen.getByLabelText('Secret token')).not.toHaveValue(SECRET);
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Secret token copied to clipboard' })
    );
  });

  it('shows the setup steps including pipeline and job events', async () => {
    mockFetch(200, { url: ORG_URL, secret: SECRET, scope: 'organization', organizationId: 'org123' });

    render(<WebhookSetup />);
    await screen.findByLabelText('Webhook URL');

    expect(screen.getByText('Settings → Webhooks → Add new webhook')).toBeInTheDocument();
    expect(screen.getByText('Enable "Pipeline events" and "Job events"')).toBeInTheDocument();
  });

  it('shows the note for the install-wide URL', async () => {
    mockFetch(200, {
      url: 'https://ci.example.com/api/webhook/gitlab',
      secret: SECRET,
      scope: 'global',
      organizationId: null,
      note: 'You are not a member of any organization, so this is the install-wide webhook URL.',
    });

    render(<WebhookSetup />);

    expect(await screen.findByTestId('webhook-scope-note')).toHaveTextContent(/install-wide/);
  });

  it('explains that only admins can see the secret on 403', async () => {
    mockFetch(403, { error: 'Forbidden' });

    render(<WebhookSetup />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Only organization admins/);
    expect(screen.queryByLabelText('Secret token')).not.toBeInTheDocument();
  });

  it('shows the server message when the webhook secret is not configured', async () => {
    mockFetch(503, { error: 'GITLAB_WEBHOOK_SECRET is not configured.' });

    render(<WebhookSetup />);

    expect(await screen.findByRole('alert')).toHaveTextContent('GITLAB_WEBHOOK_SECRET is not configured.');
  });
});
