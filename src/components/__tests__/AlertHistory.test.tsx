import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertHistory from '../AlertHistory';
import { useDashboardStore } from '@/store/dashboard-store';
import { deferred } from '../__fixtures__/gitlab';

const mockCsrfFetch = jest.fn();
jest.mock('@/lib/api/csrf-client', () => ({
  csrfFetch: (...args: unknown[]) => mockCsrfFetch(...args),
}));

interface Entry {
  id: string;
  projectName: string;
}

const entry = (id: string, projectName: string) => ({
  id,
  projectName,
  pipelineId: 1,
  status: 'failed',
  channel: 'slack',
  message: `Pipeline failed in ${projectName}`,
  sent: true,
  error: null,
  createdAt: new Date().toISOString(),
});

const analytics = {
  summary: { totalAlerts: 1234, successfulAlerts: 1200, failedAlerts: 34, successRate: 97.2 },
  channelStats: {},
  statusStats: {},
  projectStats: [],
  timeSeries: [],
};

const jsonResponse = (body: unknown) => Promise.resolve({ json: () => Promise.resolve(body) } as Response);

describe('AlertHistory', () => {
  const originalFetch = global.fetch;
  let historyPages: Array<{ data: Entry[]; pagination: { hasMore: boolean; nextCursor: string | null } }>;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState({ notifications: [] });
    historyPages = [{ data: [entry('a', 'web')], pagination: { hasMore: false, nextCursor: null } }];
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/history/analytics')) return jsonResponse(analytics);
      if (url.startsWith('/api/history?')) return jsonResponse(historyPages.shift() ?? { data: [], pagination: { hasMore: false, nextCursor: null } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const historyUrls = () =>
    fetchMock.mock.calls.map(([u]) => u as string).filter((u) => u.startsWith('/api/history?'));

  it('loads history and analytics on mount', async () => {
    render(<AlertHistory />);

    expect(screen.getByText('Loading history...')).toBeInTheDocument();
    expect(await screen.findByText('Pipeline failed in web')).toBeInTheDocument();
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(historyUrls()).toEqual(['/api/history?limit=50']);
    expect(fetchMock).toHaveBeenCalledWith('/api/history/analytics?days=30');
  });

  it('reloads with the new filters and shows the loading state meanwhile', async () => {
    render(<AlertHistory />);
    expect(await screen.findByText('Pipeline failed in web')).toBeInTheDocument();

    const pending = deferred<Response>();
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/history?') ? pending.promise : jsonResponse(analytics)
    );

    fireEvent.change(screen.getByPlaceholderText('Search by project name...'), { target: { value: 'api' } });

    // The stale list stays visible (as before), but the analytics cards are hidden while loading.
    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
    await waitFor(() => expect(historyUrls()).toContain('/api/history?limit=50&search=api'));

    await act(async () => {
      pending.resolve({
        json: () => Promise.resolve({ data: [entry('b', 'api')], pagination: { hasMore: false, nextCursor: null } }),
      } as Response);
    });

    expect(await screen.findByText('Pipeline failed in api')).toBeInTheDocument();
    expect(screen.queryByText('Pipeline failed in web')).not.toBeInTheDocument();
    expect(await screen.findByText('1,234')).toBeInTheDocument();
  });

  it('passes status and channel filters to the API', async () => {
    render(<AlertHistory />);
    await screen.findByText('Pipeline failed in web');

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.change(screen.getByDisplayValue('All Status'), { target: { value: 'failed' } });
    fireEvent.change(screen.getByDisplayValue('All Channels'), { target: { value: 'slack' } });

    await waitFor(() =>
      expect(historyUrls()).toContain('/api/history?limit=50&status=failed&channel=slack')
    );
  });

  it('appends the next page on "Load More"', async () => {
    historyPages = [
      { data: [entry('a', 'web')], pagination: { hasMore: true, nextCursor: 'cursor-1' } },
      { data: [entry('b', 'api')], pagination: { hasMore: false, nextCursor: null } },
    ];
    render(<AlertHistory />);

    fireEvent.click(await screen.findByRole('button', { name: 'Load More' }));

    expect(await screen.findByText('Pipeline failed in api')).toBeInTheDocument();
    expect(screen.getByText('Pipeline failed in web')).toBeInTheDocument();
    expect(historyUrls()).toEqual(['/api/history?limit=50', '/api/history?limit=50&cursor=cursor-1']);
    expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
  });

  it('notifies when history cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/history?') ? Promise.reject(new Error('down')) : jsonResponse(analytics)
    );

    render(<AlertHistory />);

    await waitFor(() =>
      expect(useDashboardStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'error', title: 'Error', message: 'Failed to load history' }),
      ])
    );
    expect(await screen.findByText('No Alert History')).toBeInTheDocument();
  });

  it('deletes an entry through the CSRF-protected API and refreshes analytics', async () => {
    mockCsrfFetch.mockResolvedValue({ ok: true });
    render(<AlertHistory />);
    await screen.findByText('Pipeline failed in web');
    const analyticsCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/history/analytics')).length;
    const before = analyticsCalls();

    const row = screen.getByText('Pipeline failed in web').closest('div.group') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);

    await waitFor(() => expect(screen.queryByText('Pipeline failed in web')).not.toBeInTheDocument());
    expect(mockCsrfFetch).toHaveBeenCalledWith('/api/history?id=a', { method: 'DELETE' });
    expect(analyticsCalls()).toBe(before + 1);
    expect(useDashboardStore.getState().notifications).toEqual([
      expect.objectContaining({ type: 'success', title: 'Success', message: 'Item deleted successfully' }),
    ]);
  });
});
