/**
 * Parser for GitLab job traces.
 *
 * Turns raw runner output into plain data (text + style per segment) so the UI can render it as
 * React text nodes. Nothing here produces HTML, so log content can never inject markup.
 *
 * Supported:
 * - SGR: reset, bold, dim, italic, underline, inverse, strikethrough; 8/16/256-colour and
 *   truecolor foreground/background.
 * - Terminal line semantics: `\r` returns to column 0 and later output overwrites earlier output
 *   (progress bars keep their final state), `\b`, erase-in-line (`ESC[K`), horizontal cursor moves.
 * - Every other escape sequence (CSI, OSC, two-byte ESC) and control character is dropped.
 * - GitLab sections: `section_start:<ts>:<name>[opts]\r\e[0K<header>` / `section_end:<ts>:<name>`.
 */

/** Palette index (0-255) or `#rrggbb`. */
export type AnsiColor = number | string;

export interface AnsiStyle {
  readonly fg?: AnsiColor;
  readonly bg?: AnsiColor;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly inverse?: boolean;
  readonly strike?: boolean;
}

export interface LogSegment {
  text: string;
  style: AnsiStyle | null;
}

export type LogLevel = 'error' | 'warning' | 'success' | 'info' | 'default';

export interface LogLine {
  /** 1-based number shown in the gutter. */
  lineNumber: number;
  segments: LogSegment[];
  /** Plain text without escape sequences, used for search and level detection. */
  text: string;
  level: LogLevel;
  /** Number of enclosing sections (a header is at the depth of its parent). */
  depth: number;
  /** Innermost enclosing section; for a header line, the section it opens. */
  section: number | null;
  isSectionHeader: boolean;
}

export interface LogSection {
  id: number;
  name: string;
  parent: number | null;
  /** Index in `lines` of the header line. */
  headerIndex: number;
  /** Index in `lines` of the last line belonging to the section (the header itself if empty). */
  lastIndex: number;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
  collapsed: boolean;
  hideDuration: boolean;
}

export interface ParsedLog {
  lines: LogLine[];
  sections: LogSection[];
}

// Marker is followed by `\r` (and usually ESC[0K) which is what hides it in a real terminal.
const SECTION_MARKER = /section_(start|end):(\d+):([A-Za-z0-9_.-]+)(?:\[([^\]\r\n]*)\])?\r(?:\x1b\[0?K)?/g;
// Anything that needs the slow path: escapes, carriage returns, other C0 controls, DEL.
const NEEDS_TERMINAL = /[\x00-\x08\x0b-\x1f\x7f]/;

// ---------------------------------------------------------------------------
// SGR
// ---------------------------------------------------------------------------

function extendedColor(params: number[][], i: number): { color: AnsiColor | undefined; next: number } {
  // Colon form arrives as a single param with sub-params: [38, 5, n] or [38, 2, (cs,) r, g, b].
  const group = params[i];
  if (group.length > 1) {
    const [, mode, ...rest] = group;
    if (mode === 5 && rest.length >= 1) return { color: clampByte(rest[0]), next: i + 1 };
    if (mode === 2 && rest.length >= 3) {
      const rgb = rest.length >= 4 ? rest.slice(1, 4) : rest.slice(0, 3);
      return { color: rgbHex(rgb[0], rgb[1], rgb[2]), next: i + 1 };
    }
    return { color: undefined, next: i + 1 };
  }
  const mode = params[i + 1]?.[0];
  if (mode === 5 && params[i + 2] !== undefined) {
    return { color: clampByte(params[i + 2][0]), next: i + 3 };
  }
  if (mode === 2 && params[i + 4] !== undefined) {
    return {
      color: rgbHex(params[i + 2][0], params[i + 3][0], params[i + 4][0]),
      next: i + 5,
    };
  }
  return { color: undefined, next: params.length };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n | 0));
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

function compact(style: AnsiStyle): AnsiStyle | null {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [k, v] of Object.entries(style)) {
    if (v !== undefined && v !== false) {
      out[k] = v;
      any = true;
    }
  }
  return any ? (out as AnsiStyle) : null;
}

/** Applies an SGR parameter string (the part between `ESC[` and `m`). */
export function applySgr(current: AnsiStyle | null, paramText: string): AnsiStyle | null {
  const params = (paramText === '' ? [''] : paramText.split(';')).map((p) =>
    p.split(':').map((n) => (n === '' ? 0 : Number.parseInt(n, 10) || 0)),
  );
  const s: { -readonly [K in keyof AnsiStyle]: AnsiStyle[K] } = { ...(current ?? {}) };
  let i = 0;
  while (i < params.length) {
    const code = params[i][0];
    if (code === 0) {
      for (const key of Object.keys(s) as (keyof AnsiStyle)[]) delete s[key];
    } else if (code === 1) s.bold = true;
    else if (code === 2) s.dim = true;
    else if (code === 3) s.italic = true;
    else if (code === 4) s.underline = true;
    else if (code === 7) s.inverse = true;
    else if (code === 9) s.strike = true;
    else if (code === 22) {
      s.bold = false;
      s.dim = false;
    } else if (code === 23) s.italic = false;
    else if (code === 24) s.underline = false;
    else if (code === 27) s.inverse = false;
    else if (code === 29) s.strike = false;
    else if (code >= 30 && code <= 37) s.fg = code - 30;
    else if (code === 39) s.fg = undefined;
    else if (code >= 40 && code <= 47) s.bg = code - 40;
    else if (code === 49) s.bg = undefined;
    else if (code >= 90 && code <= 97) s.fg = code - 90 + 8;
    else if (code >= 100 && code <= 107) s.bg = code - 100 + 8;
    else if (code === 38 || code === 48) {
      const { color, next } = extendedColor(params, i);
      if (color !== undefined) {
        if (code === 38) s.fg = color;
        else s.bg = color;
      }
      i = next;
      continue;
    }
    i += 1;
  }
  return compact(s);
}

// ---------------------------------------------------------------------------
// One terminal line
// ---------------------------------------------------------------------------

/**
 * A single terminal row. Appending at the end (the common case) just extends the segment list;
 * writes behind the end (after `\r`, `\b`, cursor moves) fall back to per-cell overwrite.
 */
class LineBuffer {
  segments: LogSegment[] = [];
  length = 0;
  col = 0;

  write(text: string, style: AnsiStyle | null): void {
    if (!text) return;
    if (this.col > this.length) this.append(' '.repeat(this.col - this.length), null);
    if (this.col === this.length) {
      this.append(text, style);
      this.col = this.length;
      return;
    }
    const { chars, styles } = this.cells();
    for (let k = 0; k < text.length; k += 1) {
      chars[this.col + k] = text[k];
      styles[this.col + k] = style;
    }
    this.col += text.length;
    this.fromCells(chars, styles);
  }

  /** ESC[K modes: 0 = cursor to end, 1 = start to cursor, 2 = whole line. */
  erase(mode: number): void {
    if (mode === 0) {
      if (this.col < this.length) {
        const { chars, styles } = this.cells();
        this.fromCells(chars.slice(0, this.col), styles.slice(0, this.col));
      }
    } else if (mode === 1) {
      const { chars, styles } = this.cells();
      const upto = Math.min(this.col + 1, chars.length);
      for (let k = 0; k < upto; k += 1) {
        chars[k] = ' ';
        styles[k] = null;
      }
      this.fromCells(chars, styles);
    } else if (mode === 2) {
      this.segments = [];
      this.length = 0;
    }
  }

  private append(text: string, style: AnsiStyle | null): void {
    const last = this.segments[this.segments.length - 1];
    if (last && last.style === style) last.text += text;
    else this.segments.push({ text, style });
    this.length += text.length;
  }

  private cells(): { chars: string[]; styles: (AnsiStyle | null)[] } {
    const chars: string[] = [];
    const styles: (AnsiStyle | null)[] = [];
    for (const seg of this.segments) {
      for (let k = 0; k < seg.text.length; k += 1) {
        chars.push(seg.text[k]);
        styles.push(seg.style);
      }
    }
    return { chars, styles };
  }

  private fromCells(chars: string[], styles: (AnsiStyle | null)[]): void {
    this.segments = [];
    this.length = 0;
    for (let k = 0; k < chars.length; k += 1) this.append(chars[k] ?? ' ', styles[k] ?? null);
  }
}

interface TerminalState {
  style: AnsiStyle | null;
}

function isFinalByte(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
}

/** Interprets `input` as one terminal row. Style state carries over between calls, like a terminal. */
function renderRow(input: string, state: TerminalState): LogSegment[] {
  if (!NEEDS_TERMINAL.test(input)) {
    return input ? [{ text: input, style: state.style }] : [];
  }
  const buf = new LineBuffer();
  let i = 0;
  const n = input.length;
  while (i < n) {
    const code = input.charCodeAt(i);
    if (code === 0x1b) {
      const kind = input[i + 1];
      if (kind === '[') {
        // CSI: params 0x30-0x3F, intermediates 0x20-0x2F, final 0x40-0x7E.
        let j = i + 2;
        while (j < n && input.charCodeAt(j) >= 0x30 && input.charCodeAt(j) <= 0x3f) j += 1;
        const params = input.slice(i + 2, j);
        while (j < n && input.charCodeAt(j) >= 0x20 && input.charCodeAt(j) <= 0x2f) j += 1;
        if (j >= n || !isFinalByte(input.charCodeAt(j))) {
          i = j; // malformed/truncated: drop what we consumed
          continue;
        }
        const final = input[j];
        const privateMode = params.startsWith('?') || params.startsWith('>') || params.startsWith('<') || params.startsWith('=');
        if (!privateMode) {
          const num = Number.parseInt(params, 10);
          if (final === 'm') state.style = applySgr(state.style, params);
          else if (final === 'K') buf.erase(Number.isNaN(num) ? 0 : num);
          else if (final === 'G') buf.col = Math.max(0, (Number.isNaN(num) ? 1 : num) - 1);
          else if (final === 'C') buf.col += Number.isNaN(num) || num === 0 ? 1 : num;
          else if (final === 'D') buf.col = Math.max(0, buf.col - (Number.isNaN(num) || num === 0 ? 1 : num));
          // Vertical moves, screen clears, scroll regions etc. have no meaning in a log: dropped.
        }
        i = j + 1;
      } else if (kind === ']' || kind === 'P' || kind === '_' || kind === '^' || kind === 'X') {
        // OSC / DCS / APC / PM / SOS: skip to BEL or ST (ESC \).
        let j = i + 2;
        while (j < n) {
          if (input.charCodeAt(j) === 0x07) {
            j += 1;
            break;
          }
          if (input.charCodeAt(j) === 0x1b && input[j + 1] === '\\') {
            j += 2;
            break;
          }
          j += 1;
        }
        i = j;
      } else {
        // Two-byte (or charset-designation) escapes: ESC [0x20-0x2F]* [0x30-0x7E].
        let j = i + 1;
        while (j < n && input.charCodeAt(j) >= 0x20 && input.charCodeAt(j) <= 0x2f) j += 1;
        i = j < n ? j + 1 : n;
      }
    } else if (code === 0x0d) {
      buf.col = 0;
      i += 1;
    } else if (code === 0x08) {
      buf.col = Math.max(0, buf.col - 1);
      i += 1;
    } else if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
      i += 1;
    } else {
      let j = i + 1;
      while (j < n) {
        const c = input.charCodeAt(j);
        if ((c < 0x20 && c !== 0x09) || c === 0x7f) break;
        j += 1;
      }
      buf.write(input.slice(i, j), state.style);
      i = j;
    }
  }
  return buf.segments;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Keyword heuristic used by the level filter and the error/warning counters. */
export function classifyLine(text: string): LogLevel {
  const lower = text.toLowerCase();
  if (
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('fatal') ||
    lower.includes('exception') ||
    lower.includes('✗')
  ) {
    return 'error';
  }
  if (lower.includes('warn') || lower.includes('deprecated') || lower.includes('⚠')) return 'warning';
  if (
    lower.includes('success') ||
    lower.includes('complete') ||
    lower.includes('✓') ||
    lower.includes('done') ||
    lower.includes('passed') ||
    text.includes('OK:')
  ) {
    return 'success';
  }
  if (
    text.startsWith('$') ||
    text.startsWith('>') ||
    text.startsWith('#') ||
    lower.includes('running') ||
    lower.includes('executing') ||
    lower.includes('step_script')
  ) {
    return 'info';
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// Whole log
// ---------------------------------------------------------------------------

function parseOptions(raw: string | undefined): { collapsed: boolean; hideDuration: boolean } {
  const opts = { collapsed: false, hideDuration: false };
  if (!raw) return opts;
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (key === 'collapsed') opts.collapsed = value === 'true';
    if (key === 'hide_duration') opts.hideDuration = value === 'true';
  }
  return opts;
}

function textOf(segments: LogSegment[]): string {
  return segments.length === 1 ? segments[0].text : segments.map((s) => s.text).join('');
}

export function parseJobLog(raw: string): ParsedLog {
  const lines: LogLine[] = [];
  const sections: LogSection[] = [];
  const stack: number[] = [];
  const state: TerminalState = { style: null };

  const rows = raw.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();

  const pushLine = (segments: LogSegment[], header: number | null): void => {
    const text = textOf(segments);
    lines.push({
      lineNumber: lines.length + 1,
      segments,
      text,
      level: classifyLine(text),
      depth: header !== null ? stack.length - 1 : stack.length,
      section: stack.length ? stack[stack.length - 1] : null,
      isSectionHeader: header !== null,
    });
    for (const id of stack) sections[id].lastIndex = lines.length - 1;
  };

  const openSection = (time: number, name: string, options: string | undefined): number => {
    const { collapsed, hideDuration } = parseOptions(options);
    const id = sections.length;
    sections.push({
      id,
      name,
      parent: stack.length ? stack[stack.length - 1] : null,
      headerIndex: lines.length,
      lastIndex: lines.length,
      startedAt: time,
      endedAt: null,
      durationSeconds: null,
      collapsed,
      hideDuration,
    });
    stack.push(id);
    return id;
  };

  const closeSection = (time: number, name: string): void => {
    // Close the matching section and anything still open inside it; ignore unknown names.
    let at = -1;
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      if (sections[stack[k]].name === name) {
        at = k;
        break;
      }
    }
    if (at === -1) return;
    for (const id of stack.splice(at)) {
      sections[id].endedAt = time;
      sections[id].durationSeconds = Math.max(0, time - sections[id].startedAt);
    }
  };

  for (const row of rows) {
    const markers = row.indexOf('section_') === -1 ? [] : [...row.matchAll(SECTION_MARKER)];
    if (markers.length === 0) {
      pushLine(renderRow(row, state), null);
      continue;
    }

    // Row = text, marker, text, marker, ..., text. Each text chunk is interpreted after the marker
    // before it: a header after section_start, an ordinary line otherwise (dropped when empty,
    // since the markers themselves are invisible in a terminal).
    let cursor = 0;
    for (let k = 0; k <= markers.length; k += 1) {
      const marker = k < markers.length ? markers[k] : null;
      const chunk = row.slice(cursor, marker ? marker.index : row.length);
      const previous = k > 0 ? markers[k - 1] : null;
      const segments = renderRow(chunk, state);

      if (previous && previous[1] === 'start') {
        const id = openSection(Number(previous[2]), previous[3], previous[4]);
        pushLine(segments.length ? segments : [{ text: sections[id].name, style: null }], id);
      } else {
        if (previous) closeSection(Number(previous[2]), previous[3]);
        if (textOf(segments) !== '') pushLine(segments, null);
      }

      if (marker) cursor = marker.index + marker[0].length;
    }
  }

  // Runners finish with a bare `ESC[0;m` row; it renders as nothing, so don't show an empty line.
  const lastRow = rows[rows.length - 1];
  const last = lines[lines.length - 1];
  if (last && !last.isSectionHeader && last.text === '' && lastRow !== undefined && lastRow !== '') {
    lines.pop();
    for (const section of sections) section.lastIndex = Math.min(section.lastIndex, lines.length - 1);
  }

  return { lines, sections };
}

let cached: { raw: string; parsed: ParsedLog } | null = null;

/**
 * `parseJobLog` with a one-entry cache: the inline log tab and the full-screen viewer show the
 * same trace, and a live job re-renders both every few seconds.
 */
export function parseJobLogCached(raw: string): ParsedLog {
  if (cached?.raw !== raw) cached = { raw, parsed: parseJobLog(raw) };
  return cached.parsed;
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure, shared by the viewers)
// ---------------------------------------------------------------------------

/** GitLab-style duration: `00:07`, `12:34`, `1:02:03`. */
export function formatSectionDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const BASE_16 = [
  '#52525b', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#e879f9', '#22d3ee', '#d4d4d8',
  '#71717a', '#fca5a5', '#86efac', '#fde047', '#93c5fd', '#f0abfc', '#67e8f9', '#fafafa',
];
const CUBE = [0, 95, 135, 175, 215, 255];

/** Resolves a colour to CSS. The first 16 are tuned for the log's dark background. */
export function ansiColorToCss(color: AnsiColor): string {
  if (typeof color === 'string') return color;
  if (color < 16) return BASE_16[color];
  if (color < 232) {
    const n = color - 16;
    return rgbHex(CUBE[Math.floor(n / 36)], CUBE[Math.floor(n / 6) % 6], CUBE[n % 6]);
  }
  const v = 8 + (color - 232) * 10;
  return rgbHex(v, v, v);
}

export const DEFAULT_LOG_FG = '#d4d4d8';
export const DEFAULT_LOG_BG = '#000000';

export type LogFilterLevel = 'all' | 'error' | 'warning' | 'info';

export function lineMatches(line: LogLine, lowerTerm: string, level: LogFilterLevel): boolean {
  if (level !== 'all' && line.level !== level) return false;
  if (lowerTerm && !line.text.toLowerCase().includes(lowerTerm)) return false;
  return true;
}

