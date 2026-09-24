import { act, fireEvent, render, screen } from '@testing-library/react';
import LogViewer from '../LogViewer';

const E = '\x1b';

const TRACE = [
  `section_start:100:step_script\r${E}[0K${E}[36;1mExecuting "step_script" stage of the job script${E}[0;m`,
  `${E}[32;1m$ npm run lint${E}[0;m`,
  `npm WARN deprecated inflight@1.0.6`,
  `${E}[31mError: lint failed${E}[0m`,
  `section_end:112:step_script\r${E}[0K`,
  `${E}[31;1mERROR: Job failed: exit code 1${E}[0;m`,
].join('\n');

describe('LogViewer', () => {
  afterEach(() => jest.useRealTimers());

  it('renders the parsed log with counts and no raw escape codes', () => {
    render(<LogViewer logs={TRACE} jobName="lint" onClose={jest.fn()} />);
    expect(screen.getByText('Job Logs: lint')).toBeInTheDocument();
    expect(screen.getByText('5 / 5 lines')).toBeInTheDocument();
    expect(screen.getByText('2 errors')).toBeInTheDocument();
    expect(screen.getByText('1 warnings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Executing "step_script"/ })).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.textContent).not.toContain('\x1b');
    expect(document.body.textContent).not.toContain('section_');
  });

  it('searches and highlights', () => {
    render(<LogViewer logs={TRACE} jobName="lint" onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Search in logs'), { target: { value: 'lint' } });
    expect(screen.getByText('2 / 5 lines')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['lint', 'lint']);
  });

  it('filters by level', () => {
    render(<LogViewer logs={TRACE} jobName="lint" onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Warnings' }));
    expect(screen.getByText('1 / 5 lines')).toBeInTheDocument();
    expect(screen.getByText('npm WARN deprecated inflight@1.0.6')).toBeInTheDocument();
    expect(screen.queryByText('$ npm run lint')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<LogViewer logs={TRACE} jobName="lint" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('refreshes a running job and follows the end until auto-scroll is turned off', async () => {
    jest.useFakeTimers();
    const scrollHeight = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    const onRefreshLogs = jest.fn().mockResolvedValue(undefined);
    try {
      const { rerender } = render(
        <LogViewer logs="a" jobName="lint" jobStatus="running" onClose={jest.fn()} onRefreshLogs={onRefreshLogs} />,
      );
      const scroller = document.getElementById('log-container') as HTMLElement;
      expect(scroller.scrollTop).toBe(900);

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(onRefreshLogs).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle('Auto-scroll to bottom'));
      scroller.scrollTop = 0;
      rerender(<LogViewer logs={'a\nb'} jobName="lint" jobStatus="running" onClose={jest.fn()} onRefreshLogs={onRefreshLogs} />);
      expect(scroller.scrollTop).toBe(0);
    } finally {
      scrollHeight.mockRestore();
    }
  });
});
