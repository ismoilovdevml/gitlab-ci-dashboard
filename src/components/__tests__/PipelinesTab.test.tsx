import { act, render, screen, fireEvent } from '@testing-library/react';
import PipelinesTab from '../PipelinesTab';
import { useDashboardStore } from '@/store/dashboard-store';
import type { Pipeline, PipelinePage, PipelinePageOptions } from '@/lib/gitlab-api';
import { makePipeline, makeProject } from '../__fixtures__/gitlab';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
}));

const mockGetProjects = jest.fn();
const mockGetPipelinePage = jest.fn<Promise<PipelinePage>, [number, PipelinePageOptions]>();
jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn(() =>
    Promise.resolve({ getProjects: mockGetProjects, getPipelinePage: mockGetPipelinePage })
  ),
}));

function page(pipelines: Pipeline[], overrides: Partial<PipelinePage> = {}): PipelinePage {
  return {
    pipelines,
    page: 1,
    perPage: 20,
    total: pipelines.length,
    totalPages: 1,
    nextPage: null,
    ...overrides,
  };
}

/** A project with 3 pages of pipelines; ids encode project and page (#1201 = project 1, page 2). */
function threePages(projectId: number, options: PipelinePageOptions, headers: 'full' | 'no-total' = 'full') {
  const current = options.page ?? 1;
  const pipelines = [
    makePipeline({ id: projectId * 1000 + current * 100 + 1, project_id: projectId, status: 'success' }),
    makePipeline({ id: projectId * 1000 + current * 100 + 2, project_id: projectId, status: 'failed' }),
  ];
  return page(pipelines, {
    page: current,
    total: headers === 'full' ? 45 : null,
    totalPages: headers === 'full' ? 3 : null,
    nextPage: current < 3 ? current + 1 : null,
  });
}

const flush = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

async function renderLoaded() {
  render(<PipelinesTab />);
  await flush();
  await flush(300);
}

const lastOptions = () => mockGetPipelinePage.mock.calls[mockGetPipelinePage.mock.calls.length - 1][1];

describe('PipelinesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useDashboardStore.setState({ projects: [] });
    mockGetProjects.mockResolvedValue([
      makeProject({ id: 1, name: 'web' }),
      makeProject({ id: 2, name: 'api' }),
    ]);
    mockGetPipelinePage.mockImplementation((projectId, options) =>
      Promise.resolve(threePages(projectId, options))
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads projects, selects the first and loads its first page after the debounce', async () => {
    render(<PipelinesTab />);
    await flush();

    expect(mockGetProjects).toHaveBeenCalledWith(1, 50);
    expect(useDashboardStore.getState().projects).toHaveLength(2);
    expect(mockGetPipelinePage).not.toHaveBeenCalled();

    await flush(300);

    expect(mockGetPipelinePage).toHaveBeenCalledTimes(1);
    expect(mockGetPipelinePage).toHaveBeenCalledWith(1, expect.objectContaining({ page: 1, perPage: 20 }));
    expect(lastOptions().status).toBeUndefined();
    expect(screen.getByText('#1101')).toBeInTheDocument();
    expect(screen.getByText('#1102')).toBeInTheDocument();
  });

  it('pages through all pages using the GitLab totals', async () => {
    await renderLoaded();

    expect(screen.getByText(/Page 1 of 3/)).toHaveTextContent('45 pipelines');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();
    expect(lastOptions().page).toBe(2);
    expect(screen.getByText('#1201')).toBeInTheDocument();
    expect(screen.queryByText('#1101')).not.toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    await flush();
    expect(lastOptions().page).toBe(3);
    expect(screen.getByText('#1301')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await flush();
    expect(lastOptions().page).toBe(2);
    expect(screen.getByText('#1201')).toBeInTheDocument();
  });

  it('falls back to the next-page header when GitLab omits the totals', async () => {
    mockGetPipelinePage.mockImplementation((projectId, options) =>
      Promise.resolve(threePages(projectId, options, 'no-total'))
    );
    await renderLoaded();

    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 2' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();

    expect(lastOptions().page).toBe(3);
    expect(screen.getByText('Page 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('hides pagination when everything fits on one page', async () => {
    mockGetPipelinePage.mockResolvedValue(page([makePipeline({ id: 11 })]));
    await renderLoaded();

    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pipeline pages' })).not.toBeInTheDocument();
  });

  it('ignores a slower response for a page the user already left', async () => {
    await renderLoaded();

    let resolveSlow: (value: PipelinePage) => void = () => undefined;
    mockGetPipelinePage.mockImplementationOnce(
      () => new Promise<PipelinePage>((resolve) => { resolveSlow = resolve; })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    await flush();
    expect(screen.getByText('#1301')).toBeInTheDocument();

    await act(async () => {
      resolveSlow(threePages(1, { page: 2 }));
    });
    expect(screen.getByText('#1301')).toBeInTheDocument();
    expect(screen.queryByText('#1201')).not.toBeInTheDocument();
  });

  it('reloads page 1 for another project and ignores clicks on the selected one', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();
    expect(mockGetPipelinePage).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /web/ }));
    await flush(300);
    expect(mockGetPipelinePage).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /api/ }));
    await flush(300);
    expect(mockGetPipelinePage).toHaveBeenCalledTimes(3);
    expect(mockGetPipelinePage).toHaveBeenLastCalledWith(2, expect.objectContaining({ page: 1 }));
    expect(screen.getByText('#2101')).toBeInTheDocument();
  });

  it('sends the status filter to GitLab through one debounced reload from page 1', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();

    fireEvent.change(screen.getByDisplayValue('All Status'), { target: { value: 'failed' } });
    fireEvent.change(screen.getByDisplayValue('Failed'), { target: { value: 'success' } });
    fireEvent.change(screen.getByDisplayValue('Success'), { target: { value: 'failed' } });
    await flush(300);

    // Three quick changes, one request.
    expect(mockGetPipelinePage).toHaveBeenCalledTimes(3);
    expect(lastOptions()).toEqual(expect.objectContaining({ page: 1, status: 'failed' }));
  });

  it('sends the date range to GitLab as updated_after', async () => {
    await renderLoaded();
    const before = Date.parse(lastOptions().updatedAfter ?? '');
    expect(Date.now() - before).toBeGreaterThan(7 * 86_400_000 - 3_600_000 - 1000);
    expect(Date.now() - before).toBeLessThan(7 * 86_400_000 + 3_600_000 + 1000);

    fireEvent.change(screen.getByDisplayValue('Last 7 days'), { target: { value: '1' } });
    await flush(300);

    expect(mockGetPipelinePage).toHaveBeenCalledTimes(2);
    const after = Date.parse(lastOptions().updatedAfter ?? '');
    expect(Date.now() - after).toBeLessThan(86_400_000 + 3_600_000 + 1000);
  });

  it('refreshes the current page immediately from the refresh button', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await flush();

    expect(mockGetPipelinePage).toHaveBeenCalledTimes(3);
    expect(lastOptions().page).toBe(2);
  });

  describe('statistics scope', () => {
    it('labels page-based stats when the header total covers more runs', async () => {
      await renderLoaded();

      expect(screen.getByText('Total Runs')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('Success Rate (this page)')).toBeInTheDocument();
      expect(screen.getByText('Avg Duration (this page)')).toBeInTheDocument();
      expect(screen.getByText('Failed (this page)')).toBeInTheDocument();
      expect(screen.getByText(/Pipeline Status Distribution \(this page\)/)).toBeInTheDocument();
    });

    it('labels the run count as this page when GitLab omits the total', async () => {
      mockGetPipelinePage.mockImplementation((projectId, options) =>
        Promise.resolve(threePages(projectId, options, 'no-total'))
      );
      await renderLoaded();

      expect(screen.getByText('Runs (this page)')).toBeInTheDocument();
      expect(screen.queryByText('Total Runs')).not.toBeInTheDocument();
      expect(screen.getByText('Success Rate (this page)')).toBeInTheDocument();
    });

    it('uses plain labels when one page holds every run', async () => {
      mockGetPipelinePage.mockResolvedValue(page([makePipeline({ id: 11 })]));
      await renderLoaded();

      expect(screen.getByText('Total Runs')).toBeInTheDocument();
      expect(screen.getAllByText('Success Rate').length).toBeGreaterThan(0);
      expect(screen.queryByText(/\(this page\)/)).not.toBeInTheDocument();
    });
  });
});
