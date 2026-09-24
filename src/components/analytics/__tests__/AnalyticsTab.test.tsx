import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AnalyticsTab from '../AnalyticsTab';
import type { DoraMetricsResponse } from '@/hooks/useDoraMetrics';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, default: { ...actual.default, get: jest.fn(), isAxiosError: actual.default.isAxiosError } };
});

// recharts needs layout measurements jsdom does not provide; the chart itself is not under test.
jest.mock('../TrendChart', () => ({
  __esModule: true,
  default: ({ title, data }: { title: string; data: unknown[] }) => (
    <div data-testid="trend-chart">{`${title}: ${data.length} points`}</div>
  ),
}));

const mockGet = axios.get as jest.Mock;

const empty: DoraMetricsResponse = {
  scope: 'all',
  projectId: null,
  period: '30d',
  periodStart: '2026-08-25T12:00:00.000Z',
  periodEnd: '2026-09-24T12:00:00.000Z',
  deploymentFrequency: { perDay: null, count: 0, rating: null },
  leadTime: { medianSeconds: null, averageSeconds: null, samples: 0, rating: null },
  mttr: { averageSeconds: null, recoveries: 0, rating: null },
  changeFailureRate: { rate: null, failed: 0, total: 0, rating: null },
  projects: [],
  truncated: false,
};

const withData: DoraMetricsResponse = {
  ...empty,
  deploymentFrequency: { perDay: 2.5, count: 75, rating: 'elite' },
  leadTime: { medianSeconds: 5400, averageSeconds: 6000, samples: 70, rating: 'high' },
  mttr: { averageSeconds: 1800, recoveries: 4, rating: 'elite' },
  changeFailureRate: { rate: 6.3, failed: 5, total: 80, rating: 'elite' },
  projects: [
    { id: 101, name: 'web-app', source: 'deployments', successCount: 50, failedCount: 3 },
    { id: 102, name: 'api-gateway', source: 'pipelines', successCount: 25, failedCount: 2 },
  ],
};

const point = (value: number) => ({ timestamp: '2026-09-20T12:00:00.000Z', value });
const trends = {
  deployment_frequency: { data: [point(3), point(4)] },
  lead_time: { data: [point(1.5)] },
  success_rate: { data: [] },
};
const emptyTrends = {
  deployment_frequency: { data: [] },
  lead_time: { data: [] },
  success_rate: { data: [] },
};

function respond(metrics: DoraMetricsResponse, trendData: unknown) {
  mockGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/dora/metrics')) return { data: { success: true, data: metrics } };
    if (url.startsWith('/api/trends')) return { data: { success: true, data: trendData } };
    throw new Error(`unexpected ${url}`);
  });
}

describe('AnalyticsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "No data" instead of zero values and ratings for an empty GitLab', async () => {
    respond(empty, emptyTrends);

    render(<AnalyticsTab />);

    expect(await screen.findByText('No data')).toBeInTheDocument();
    expect(screen.getByText(/No production deployments or default-branch pipelines/)).toBeInTheDocument();
    expect(screen.queryByText(/ELITE|LOW|HIGH|MEDIUM/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
  });

  it('renders computed metrics, trend charts and the project breakdown', async () => {
    respond(withData, trends);

    render(<AnalyticsTab />);

    expect(await screen.findByText('2.5')).toBeInTheDocument();
    expect(screen.getByText('per day')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument(); // lead time 5400 s
    expect(screen.getByText('30')).toBeInTheDocument(); // MTTR 1800 s in minutes
    expect(screen.getByText('6.3')).toBeInTheDocument();
    expect(screen.getByText('5 of 80 failed')).toBeInTheDocument();
    expect(screen.getAllByText('ELITE')).toHaveLength(3);
    expect(screen.getByText('HIGH')).toBeInTheDocument();

    const charts = screen.getAllByTestId('trend-chart').map((c) => c.textContent);
    expect(charts).toEqual(['Deployments (per day): 2 points', 'Lead Time (median): 1 points']);
    // A series without points shows an empty state instead of a blank chart.
    expect(screen.getByText('Deployment Success Rate')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'web-app' })).toBeInTheDocument();
    expect(screen.getByText(/1 with production environments, 1 measured by/)).toBeInTheDocument();

    expect(mockGet).toHaveBeenCalledWith('/api/dora/metrics?period=30d');
    expect(mockGet).toHaveBeenCalledWith('/api/trends?period=30d&metrics=deployment_frequency,lead_time,success_rate');
  });

  it('reloads for the selected period and project', async () => {
    respond(withData, trends);
    render(<AnalyticsTab />);
    await screen.findByText('2.5');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '7d' } });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/dora/metrics?period=7d'));

    respond({ ...withData, scope: 'project', projectId: 102, projects: [withData.projects[1]] }, trends);
    fireEvent.change(await screen.findByLabelText('Project'), { target: { value: '102' } });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/dora/metrics?period=7d&projectId=102'));
    // The selector keeps the all-projects list while one project is shown.
    expect(await screen.findByRole('option', { name: 'web-app' })).toBeInTheDocument();
  });

  it('shows the server error message', async () => {
    mockGet.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 409, data: { error: 'GitLab is not configured.', code: 'GITLAB_NOT_CONFIGURED' } },
      })
    );

    render(<AnalyticsTab />);

    expect(await screen.findByText('GitLab is not configured.')).toBeInTheDocument();
  });
});
