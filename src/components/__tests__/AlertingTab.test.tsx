import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertingTab from '../AlertingTab';
import { useDashboardStore } from '@/store/dashboard-store';

jest.mock('../WebhookSetup', () => ({
  __esModule: true,
  default: () => <div>webhook setup</div>,
}));

const mockChannelsGetAll = jest.fn();
const mockChannelsSave = jest.fn();
const mockHistoryGetAll = jest.fn();
jest.mock('@/lib/api/alerts', () => ({
  channelsApi: {
    getAll: (...args: unknown[]) => mockChannelsGetAll(...args),
    save: (...args: unknown[]) => mockChannelsSave(...args),
  },
  historyApi: {
    getAll: (...args: unknown[]) => mockHistoryGetAll(...args),
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
    mockHistoryGetAll.mockResolvedValue({ data: [] });
    mockChannelsSave.mockResolvedValue({});
  });

  it('loads the stored channel configuration on mount', async () => {
    render(<AlertingTab />);

    expect(await screen.findByRole('button', { name: /channels \(1\)/i })).toBeInTheDocument();
    expect(mockChannelsGetAll).toHaveBeenCalledTimes(1);
    expect(mockHistoryGetAll).toHaveBeenCalledWith(50);
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
});
