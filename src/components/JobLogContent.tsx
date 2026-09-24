'use client';

import {
  type CSSProperties,
  type ReactNode,
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import {
  type AnsiStyle,
  type LogFilterLevel,
  type LogLine,
  type LogSegment,
  type ParsedLog,
  DEFAULT_LOG_BG,
  DEFAULT_LOG_FG,
  ansiColorToCss,
  formatSectionDuration,
  lineMatches,
} from '@/lib/log-parser';

/** Every row has the same height so only the rows in view need to be in the DOM. */
export const LOG_ROW_HEIGHT = 20;
const OVERSCAN = 30;
// Used until the container has been measured (and in environments without layout).
const FALLBACK_VIEWPORT = 800;

interface JobLogContentProps {
  log: ParsedLog;
  searchTerm?: string;
  filterLevel?: LogFilterLevel;
  /** Keep the view pinned to the last line as the log grows. */
  follow?: boolean;
  id?: string;
  className?: string;
}

const styleCache = new WeakMap<AnsiStyle, CSSProperties>();

function cssFor(style: AnsiStyle): CSSProperties {
  const hit = styleCache.get(style);
  if (hit) return hit;
  let fg = style.fg !== undefined ? ansiColorToCss(style.fg) : undefined;
  let bg = style.bg !== undefined ? ansiColorToCss(style.bg) : undefined;
  if (style.inverse) {
    [fg, bg] = [bg ?? DEFAULT_LOG_BG, fg ?? DEFAULT_LOG_FG];
  }
  const decoration = [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean);
  const css: CSSProperties = {
    color: fg,
    backgroundColor: bg,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: decoration.length ? decoration.join(' ') : undefined,
    opacity: style.dim ? 0.7 : undefined,
  };
  styleCache.set(style, css);
  return css;
}

function findMatches(text: string, lowerTerm: string): Array<[number, number]> {
  if (!lowerTerm) return [];
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  let at = lower.indexOf(lowerTerm);
  while (at !== -1) {
    ranges.push([at, at + lowerTerm.length]);
    at = lower.indexOf(lowerTerm, at + lowerTerm.length);
  }
  return ranges;
}

function renderSegments(segments: LogSegment[], lowerTerm: string, text: string): ReactNode[] {
  const ranges = findMatches(text, lowerTerm);
  const out: ReactNode[] = [];
  let offset = 0;
  let r = 0;
  segments.forEach((seg, s) => {
    const end = offset + seg.text.length;
    const pieces: ReactNode[] = [];
    let pos = offset;
    while (pos < end) {
      while (r < ranges.length && ranges[r][1] <= pos) r += 1;
      const range = ranges[r];
      if (!range || range[0] >= end) {
        pieces.push(seg.text.slice(pos - offset));
        pos = end;
      } else if (range[0] > pos) {
        pieces.push(seg.text.slice(pos - offset, range[0] - offset));
        pos = range[0];
      } else {
        const stop = Math.min(range[1], end);
        pieces.push(
          <mark key={pos} className="rounded-sm bg-yellow-500 text-black">
            {seg.text.slice(pos - offset, stop - offset)}
          </mark>,
        );
        pos = stop;
      }
    }
    out.push(
      seg.style ? (
        <span key={s} style={cssFor(seg.style)}>
          {pieces}
        </span>
      ) : (
        <span key={s}>{pieces}</span>
      ),
    );
    offset = end;
  });
  return out;
}

const LEVEL_TINT: Partial<Record<LogLine['level'], string>> = {
  error: 'bg-red-500/10',
  warning: 'bg-yellow-500/10',
};

export default function JobLogContent({
  log,
  searchTerm = '',
  filterLevel = 'all',
  follow = false,
  id,
  className,
}: JobLogContentProps) {
  const { theme } = useTheme();
  const surface = theme === 'light' ? 'bg-[#1d1d1f]' : 'bg-black';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(FALLBACK_VIEWPORT);
  // Per-section user choice; falls back to the `[collapsed=true]` option from the log.
  const [toggled, setToggled] = useState<Record<number, boolean>>({});

  const lowerTerm = searchTerm.trim().toLowerCase();
  const filtering = lowerTerm !== '' || filterLevel !== 'all';

  const isCollapsed = useCallback(
    (sectionId: number) => toggled[sectionId] ?? log.sections[sectionId]?.collapsed ?? false,
    [toggled, log.sections],
  );

  // Indices into log.lines, in display order.
  const rows = useMemo(() => {
    const out: number[] = [];
    const { lines, sections } = log;
    if (filtering) {
      for (let i = 0; i < lines.length; i += 1) {
        if (lineMatches(lines[i], lowerTerm, filterLevel)) out.push(i);
      }
      return out;
    }
    let i = 0;
    while (i < lines.length) {
      out.push(i);
      const line = lines[i];
      if (line.isSectionHeader && line.section !== null && isCollapsed(line.section)) {
        i = sections[line.section].lastIndex + 1;
      } else {
        i += 1;
      }
    }
    return out;
  }, [log, filtering, lowerTerm, filterLevel, isCollapsed]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => {
      if (el.clientHeight > 0) setViewport(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!follow || !el) return;
    el.scrollTop = el.scrollHeight;
    setScrollTop(el.scrollTop);
  }, [follow, rows.length, log]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop);

  const toggle = (sectionId: number) =>
    setToggled((prev) => ({ ...prev, [sectionId]: !isCollapsed(sectionId) }));

  const gutterWidth = `${Math.max(3, String(log.lines.length).length) + 2}ch`;
  const first = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / LOG_ROW_HEIGHT) + OVERSCAN);

  const renderRow = (index: number) => {
    const line = log.lines[index];
    const content = renderSegments(line.segments, lowerTerm, line.text);
    const gutter = (
      <span
        className={cn('sticky left-0 z-10 shrink-0 select-none pr-3 text-right text-zinc-600', surface)}
        style={{ width: gutterWidth }}
      >
        {line.lineNumber}
      </span>
    );
    const indent = { paddingLeft: `${line.depth * 1.5}ch` };

    if (line.isSectionHeader && line.section !== null && !filtering) {
      const section = log.sections[line.section];
      const collapsed = isCollapsed(section.id);
      const duration =
        section.durationSeconds !== null && !section.hideDuration
          ? formatSectionDuration(section.durationSeconds)
          : null;
      return (
        <button
          key={index}
          type="button"
          aria-expanded={!collapsed}
          onClick={() => toggle(section.id)}
          className="flex w-max min-w-full items-center text-left hover:bg-zinc-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
          style={{ height: LOG_ROW_HEIGHT }}
          data-testid="log-section-header"
        >
          {gutter}
          <span className="flex items-center whitespace-pre" style={indent}>
            <ChevronRight
              aria-hidden="true"
              className={cn('mr-1 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform', !collapsed && 'rotate-90')}
            />
            {content}
          </span>
          {duration && (
            <span className="ml-auto shrink-0 pl-6 pr-4 tabular-nums text-zinc-500" title="Section duration">
              {duration}
            </span>
          )}
        </button>
      );
    }

    return (
      <div
        key={index}
        className={cn('flex w-max min-w-full items-center hover:bg-zinc-800/50', LEVEL_TINT[line.level])}
        style={{ height: LOG_ROW_HEIGHT }}
        data-testid="log-line"
      >
        {gutter}
        <span className="whitespace-pre pr-4" style={indent}>
          {content}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      id={id}
      onScroll={onScroll}
      className={cn('h-full overflow-auto font-mono text-xs text-zinc-300', surface, className)}
      style={{ lineHeight: `${LOG_ROW_HEIGHT}px` }}
      data-testid="log-scroll"
    >
      {log.lines.length === 0 ? (
        <div className="py-8 text-center text-zinc-500">No logs available</div>
      ) : rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-zinc-500">No logs match your filters</div>
      ) : (
        <div className="relative w-max min-w-full" style={{ height: rows.length * LOG_ROW_HEIGHT }}>
          <div className="w-max min-w-full" style={{ transform: `translateY(${first * LOG_ROW_HEIGHT}px)` }}>
            {rows.slice(first, last).map(renderRow)}
          </div>
        </div>
      )}
    </div>
  );
}
