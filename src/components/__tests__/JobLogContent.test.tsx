import { fireEvent, render, screen, within } from '@testing-library/react';
import JobLogContent, { LOG_ROW_HEIGHT } from '../JobLogContent';
import { parseJobLog } from '@/lib/log-parser';

const E = '\x1b';

const TRACE = [
  `${E}[0KRunning with gitlab-runner 17.5.0 (66269445)${E}[0;m`,
  `section_start:1727000000:prepare_executor[collapsed=true]\r${E}[0K${E}[0K${E}[36;1mPreparing the "docker" executor${E}[0;m`,
  `Using Docker executor with image node:20-alpine ...`,
  `section_end:1727000007:prepare_executor\r${E}[0K`,
  `section_start:1727000010:step_script\r${E}[0K${E}[0K${E}[36;1mExecuting "step_script" stage of the job script${E}[0;m`,
  `${E}[32;1m$ npm test${E}[0;m`,
  `${E}[38;5;208morange${E}[0m ${E}[38;2;10;20;30mtruecolor${E}[0m ${E}[1mbold${E}[0m`,
  `section_end:1727000075:step_script\r${E}[0K`,
  `${E}[31;1mERROR: Job failed: exit code 1${E}[0;m`,
].join('\n');

function renderLog(raw: string, props: Partial<React.ComponentProps<typeof JobLogContent>> = {}) {
  return render(<JobLogContent log={parseJobLog(raw)} {...props} />);
}

describe('JobLogContent', () => {
  it('renders colours as styles and never shows escape codes or section markers', () => {
    const { container } = renderLog(TRACE);
    const text = container.textContent ?? '';
    expect(text).not.toContain('\x1b');
    expect(text).not.toContain('section_start');
    expect(text).not.toContain('section_end');
    expect(text).not.toMatch(/\[0;m|\[0K/);

    expect(screen.getByText('orange')).toHaveStyle({ color: 'rgb(255, 135, 0)' });
    expect(screen.getByText('truecolor')).toHaveStyle({ color: 'rgb(10, 20, 30)' });
    expect(screen.getByText('bold')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('ERROR: Job failed: exit code 1')).toHaveStyle({ fontWeight: '700' });
  });

  it('renders sections as toggle buttons with duration, honouring collapsed=true', () => {
    renderLog(TRACE);
    const prepare = screen.getByRole('button', { name: /Preparing the "docker" executor/ });
    const script = screen.getByRole('button', { name: /Executing "step_script" stage/ });

    expect(prepare).toHaveAttribute('aria-expanded', 'false');
    expect(within(prepare).getByText('00:07')).toBeInTheDocument();
    expect(screen.queryByText(/Using Docker executor/)).not.toBeInTheDocument();

    expect(script).toHaveAttribute('aria-expanded', 'true');
    expect(within(script).getByText('01:05')).toBeInTheDocument();
    expect(screen.getByText('$ npm test')).toBeInTheDocument();

    fireEvent.click(prepare);
    expect(prepare).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Using Docker executor/)).toBeInTheDocument();

    fireEvent.click(script);
    expect(screen.queryByText('$ npm test')).not.toBeInTheDocument();
    // Lines after the section stay visible and keep their numbers.
    expect(screen.getByText('ERROR: Job failed: exit code 1')).toBeInTheDocument();
  });

  it('collapses nested sections independently', () => {
    const raw = [
      `section_start:1:outer\r${E}[0KOuter`,
      `section_start:2:inner\r${E}[0KInner`,
      'deep line',
      `section_end:3:inner\r${E}[0K`,
      'outer line',
      `section_end:4:outer\r${E}[0K`,
    ].join('\n');
    renderLog(raw);
    fireEvent.click(screen.getByRole('button', { name: /Inner/ }));
    expect(screen.queryByText('deep line')).not.toBeInTheDocument();
    expect(screen.getByText('outer line')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Outer/ }));
    expect(screen.queryByRole('button', { name: /Inner/ })).not.toBeInTheDocument();
    expect(screen.queryByText('outer line')).not.toBeInTheDocument();
  });

  it('renders HTML in the log as text', () => {
    const { container } = renderLog(`${E}[31m<script>window.__pwned = true</script>${E}[0m\n<img src=x onerror="window.__pwned=true">`);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<script>window.__pwned = true</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="window.__pwned=true">')).toBeInTheDocument();
  });

  it('shows line numbers', () => {
    renderLog('first\nsecond\nthird');
    const rows = screen.getAllByTestId('log-line');
    expect(rows.map((r) => r.textContent)).toEqual(['1first', '2second', '3third']);
  });

  it('highlights search matches across coloured segments and filters lines, even inside collapsed sections', () => {
    const { container } = renderLog(TRACE, { searchTerm: 'DOCKER' });
    // The match lives in a collapsed section and the header; both are listed while searching.
    const marks = Array.from(container.querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['docker', 'Docker']);
    expect(screen.getAllByTestId('log-line')).toHaveLength(2);
    expect(screen.queryByTestId('log-section-header')).not.toBeInTheDocument();
  });

  it('highlights a match that spans two styled segments', () => {
    const { container } = renderLog(`${E}[31mfoo${E}[32mbar${E}[0m`, { searchTerm: 'oob' });
    expect(Array.from(container.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['oo', 'b']);
  });

  it('filters by level and reports when nothing matches', () => {
    const { rerender } = renderLog(TRACE, { filterLevel: 'error' });
    expect(screen.getAllByTestId('log-line').map((r) => r.textContent)).toEqual(['7ERROR: Job failed: exit code 1']);
    rerender(<JobLogContent log={parseJobLog(TRACE)} searchTerm="no such text" />);
    expect(screen.getByText('No logs match your filters')).toBeInTheDocument();
  });

  it('says so when there is no log', () => {
    renderLog('');
    expect(screen.getByText('No logs available')).toBeInTheDocument();
  });

  it('only mounts the rows in view for a 100k-line log', () => {
    const raw = Array.from({ length: 100_000 }, (_, i) => `${E}[32mline ${i + 1}${E}[0m`).join('\n');
    renderLog(raw);
    const scroller = screen.getByTestId('log-scroll');
    expect(screen.getAllByTestId('log-line').length).toBeLessThan(200);
    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(scroller.firstElementChild).toHaveStyle({ height: `${100_000 * LOG_ROW_HEIGHT}px` });

    fireEvent.scroll(scroller, { target: { scrollTop: 50_000 * LOG_ROW_HEIGHT } });
    expect(screen.queryByText('line 1')).not.toBeInTheDocument();
    expect(screen.getByText('line 50001')).toBeInTheDocument();
    expect(screen.getAllByTestId('log-line').length).toBeLessThan(200);
  });

  it('follows the end of the log when asked to', () => {
    const scrollHeight = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(4000);
    try {
      const { rerender } = renderLog('a\nb', { follow: true });
      const scroller = screen.getByTestId('log-scroll');
      expect(scroller.scrollTop).toBe(4000);

      scroller.scrollTop = 0;
      rerender(<JobLogContent log={parseJobLog('a\nb\nc')} follow={false} />);
      expect(scroller.scrollTop).toBe(0);

      rerender(<JobLogContent log={parseJobLog('a\nb\nc\nd')} follow />);
      expect(scroller.scrollTop).toBe(4000);

      // The user scrolls up to read: new output must not yank the view back down.
      fireEvent.scroll(scroller, { target: { scrollTop: 100 } });
      rerender(<JobLogContent log={parseJobLog('a\nb\nc\nd\ne')} follow />);
      expect(scroller.scrollTop).toBe(100);

      // Back at the bottom: following resumes.
      fireEvent.scroll(scroller, { target: { scrollTop: 4000 } });
      rerender(<JobLogContent log={parseJobLog('a\nb\nc\nd\ne\nf')} follow />);
      expect(scroller.scrollTop).toBe(4000);
    } finally {
      scrollHeight.mockRestore();
    }
  });
});
