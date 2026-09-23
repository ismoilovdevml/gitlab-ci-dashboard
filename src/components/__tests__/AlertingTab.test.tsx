import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertingTab from '../AlertingTab';
import { useDashboardStore } from '@/store/dashboard-store';

jest.mock('../WebhookSetup', () => ({
  __esModule: true,
  default: () => <div>webhook setup</div>,
}));

jest.mock('../AlertHistory', () => ({
  __esModule: true,
  default: () => <div>alert history</div>,
}));

const mockChannelsGetAll = jest.fn();
const mockChannelsSave = jest.fn();
const mockChannelsTest = jest.fn();
jest.mock('@/lib/api/alerts', () => ({
  TESTABLE_CHANNELS: ['telegram', 'slack', 'discord'],
  channelsApi: {
    getAll: (...args: unknown[]) => mockChannelsGetAll(...args),
    save: (...args: unknown[]) => mockChannelsSave(...args),
    test: (...args: unknown[]) => mockChannelsTest(...args),
  },
}));

const toggleFor = (channel: string) =>
  screen.getByText(new RegExp(`${channel} Configuration`, 'i')).parentElement?.querySelector('button') as HTMLButtonElement;

describe('AlertingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ notifications: [] });
    mockChannelsGetAll.mockResolvedValue([
      { type: 'slack', enabled: true, config: { webhookUrl: 'https://hooks.slack.example/x', channel: '#ci' } },
    ]);
    mockChannelsSave.mockResolvedValue({});
    mockChannelsTest.mockResolvedValue(undefined);
  });

  it('loads the stored channel configuration on mount', async () => {
    render(<AlertingTab />);

    expect(await screen.findByRole('button', { name: /channels \(1\)/i })).toBeInTheDocument();
    expect(mockChannelsGetAll).toHaveBeenCalledTimes(1);
  });

  it('notifies when the configuration cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockChannelsGetAll.mockRejectedValue(new Error('down'));

    render(<AlertingTab />);

    await waitFor(() =>
      expect(useDashboardStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'error', title: 'Error', message: 'Failed to load configuration' }),
      ])
    );
    jest.restoreAllMocks();
  });

  it('toggles a channel, saves it, and keeps the previous state object untouched', async () => {
    render(<AlertingTab />);
    fireEvent.click(await screen.findByRole('button', { name: /channels \(1\)/i }));

    fireEvent.click(toggleFor('telegram'));

    await waitFor(() => expect(mockChannelsSave).toHaveBeenCalledTimes(1));
    const [channel, enabled, config] = mockChannelsSave.mock.calls[0];
    expect(channel).toBe('telegram');
    expect(enabled).toBe(true);
    expect(config).toMatchObject({ enabled: true, botToken: '', chatId: '' });
    expect(screen.getByRole('button', { name: /channels \(2\)/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(useDashboardStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'success', title: 'Saved', message: 'telegram enabled' }),
      ])
    );

    fireEvent.click(toggleFor('telegram'));
    await waitFor(() => expect(mockChannelsSave).toHaveBeenCalledTimes(2));
    expect(mockChannelsSave.mock.calls[1][1]).toBe(false);
    // The first save received its own snapshot, not a later-mutated shared object.
    expect(mockChannelsSave.mock.calls[0][2]).toMatchObject({ enabled: true });
    expect(screen.getByRole('button', { name: /channels \(1\)/i })).toBeInTheDocument();
  });

  it('saves the active channel configuration', async () => {
    render(<AlertingTab />);
    fireEvent.click(await screen.findByRole('button', { name: /channels \(1\)/i }));

    fireEvent.change(screen.getByPlaceholderText('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'), {
      target: { value: '123:abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => expect(mockChannelsSave).toHaveBeenCalledTimes(1));
    expect(mockChannelsSave.mock.calls[0][0]).toBe('telegram');
    expect(mockChannelsSave.mock.calls[0][2]).toMatchObject({ botToken: '123:abc' });
    await waitFor(() =>
      expect(useDashboardStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'success', title: 'Saved', message: 'Channel configuration saved successfully' }),
      ])
    );
  });

  describe('Send Test Message', () => {
    const testButton = () => screen.getByRole('button', { name: /send test message/i });

    async function openChannel(channel: string) {
      render(<AlertingTab />);
      fireEvent.click(await screen.findByRole('button', { name: /channels \(1\)/i }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${channel}.*(disabled|enabled)$`, 'i') }));
    }

    it('asks the server to send a test through the saved channel', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      await openChannel('slack');

      expect(testButton()).toBeEnabled();
      expect(testButton()).toHaveAccessibleDescription(/from the server using the saved configuration/i);
      fireEvent.click(testButton());

      await waitFor(() => expect(mockChannelsTest).toHaveBeenCalledWith('slack'));
      await waitFor(() =>
        expect(useDashboardStore.getState().notifications).toEqual([
          expect.objectContaining({ type: 'success', title: 'Test sent', message: 'Test message sent to slack' }),
        ])
      );
      // The browser never calls the chat service itself.
      expect(fetchSpy).not.toHaveBeenCalled();
      delete (global as { fetch?: unknown }).fetch;
    });

    it('shows the server error when the test fails', async () => {
      mockChannelsTest.mockRejectedValue(new Error('Could not deliver the test message to slack: Slack webhook failed (HTTP 404)'));
      await openChannel('slack');

      fireEvent.click(testButton());

      await waitFor(() =>
        expect(useDashboardStore.getState().notifications).toEqual([
          expect.objectContaining({
            type: 'error',
            title: 'Test failed',
            message: 'Could not deliver the test message to slack: Slack webhook failed (HTTP 404)',
          }),
        ])
      );
      expect(testButton()).toBeEnabled();
    });

    it('is disabled until the channel is saved', async () => {
      await openChannel('telegram');

      expect(testButton()).toBeDisabled();
      expect(testButton()).toHaveAccessibleDescription(/save the configuration/i);

      fireEvent.change(screen.getByPlaceholderText('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'), {
        target: { value: '123:abc' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

      await waitFor(() => expect(testButton()).toBeEnabled());
    });

    it('is disabled while the form has unsaved edits', async () => {
      await openChannel('slack');

      fireEvent.change(screen.getByPlaceholderText('#general'), { target: { value: '#alerts' } });

      expect(testButton()).toBeDisabled();
      expect(testButton()).toHaveAccessibleDescription(/save your changes first/i);

      fireEvent.change(screen.getByPlaceholderText('#general'), { target: { value: '#ci' } });
      expect(testButton()).toBeEnabled();
    });

    it.each(['email', 'webhook'])('is not offered for %s, which the server cannot deliver to', async (channel) => {
      await openChannel(channel);
      expect(screen.getByText(new RegExp(`${channel} Configuration`, 'i'))).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: /send test message/i })).not.toBeInTheDocument();
    });
  });
});
