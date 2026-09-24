import {
  ansiColorToCss,
  applySgr,
  classifyLine,
  formatSectionDuration,
  lineMatches,
  parseJobLog,
} from '@/lib/log-parser';

const E = '\x1b';

// Shape of a real gitlab-runner 17.x trace (docker executor), byte for byte.
const RUNNER_TRACE = [
  `${E}[0KRunning with gitlab-runner 17.5.0 (66269445)${E}[0;m`,
  `${E}[0K  on docker-runner-1 t3_abc123, system ID: s_0e5f1a2b3c4d${E}[0;m`,
  `section_start:1727000000:prepare_executor\r${E}[0K${E}[0K${E}[36;1mPreparing the "docker" executor${E}[0;m${E}[0;m`,
  `${E}[0KUsing Docker executor with image node:20-alpine ...${E}[0;m`,
  `${E}[0KPulling docker image node:20-alpine ...${E}[0;m`,
  `section_end:1727000007:prepare_executor\r${E}[0K${E}[0Ksection_start:1727000007:get_sources\r${E}[0K${E}[0K${E}[36;1mGetting source from Git repository${E}[0;m${E}[0;m`,
  `${E}[32;1mFetching changes with git depth set to 20...${E}[0;m`,
  `Checking out 1a2b3c4d as detached HEAD (ref is main)...`,
  `section_end:1727000010:get_sources\r${E}[0K`,
  `section_start:1727000010:step_script\r${E}[0K${E}[0K${E}[36;1mExecuting "step_script" stage of the job script${E}[0;m${E}[0;m`,
  `${E}[32;1m$ npm ci${E}[0;m`,
  `added 812 packages in 14s`,
  `section_end:1727000075:step_script\r${E}[0K`,
  `${E}[31;1mERROR: Job failed: exit code 1`,
  `${E}[0;m`,
].join('\n');

describe('applySgr', () => {
  it('handles the 8/16 colour palette, bold and reset', () => {
    expect(applySgr(null, '31;1')).toEqual({ fg: 1, bold: true });
    expect(applySgr(null, '92')).toEqual({ fg: 10 });
    expect(applySgr(null, '44')).toEqual({ bg: 4 });
    expect(applySgr(null, '103')).toEqual({ bg: 11 });
    expect(applySgr({ fg: 1, bold: true }, '0')).toBeNull();
    expect(applySgr({ fg: 1 }, '')).toBeNull();
    // GitLab runner resets with `ESC[0;m`
    expect(applySgr({ fg: 1, bold: true }, '0;')).toBeNull();
  });

  it('handles 256-colour and truecolor in both ; and : forms', () => {
    expect(applySgr(null, '38;5;208')).toEqual({ fg: 208 });
    expect(applySgr(null, '48;5;22')).toEqual({ bg: 22 });
    expect(applySgr(null, '38;2;255;128;0')).toEqual({ fg: '#ff8000' });
    expect(applySgr(null, '48;2;1;2;3;1')).toEqual({ bg: '#010203', bold: true });
    expect(applySgr(null, '38:5:196')).toEqual({ fg: 196 });
    expect(applySgr(null, '38:2::10:20:30')).toEqual({ fg: '#0a141e' });
  });

  it('turns attributes on and off individually', () => {
    const s = applySgr(null, '1;3;4;9');
    expect(s).toEqual({ bold: true, italic: true, underline: true, strike: true });
    expect(applySgr(s, '22;23')).toEqual({ underline: true, strike: true });
    expect(applySgr({ fg: 2, bg: 3 }, '39')).toEqual({ bg: 3 });
    expect(applySgr({ fg: 2, bg: 3 }, '49')).toEqual({ fg: 2 });
  });

  it('ignores truncated extended colours instead of throwing', () => {
    expect(applySgr(null, '38;5')).toBeNull();
    expect(applySgr(null, '38;2;1')).toBeNull();
  });
});

describe('ansiColorToCss', () => {
  it('maps palette, cube, greyscale and hex', () => {
    expect(ansiColorToCss(1)).toMatch(/^#[0-9a-f]{6}$/);
    expect(ansiColorToCss(16)).toBe('#000000');
    expect(ansiColorToCss(196)).toBe('#ff0000');
    expect(ansiColorToCss(231)).toBe('#ffffff');
    expect(ansiColorToCss(232)).toBe('#080808');
    expect(ansiColorToCss(255)).toBe('#eeeeee');
    expect(ansiColorToCss('#123456')).toBe('#123456');
  });
});

describe('parseJobLog', () => {
  it('parses a real runner trace: no escape codes or markers reach the text', () => {
    const { lines, sections } = parseJobLog(RUNNER_TRACE);
    const texts = lines.map((l) => l.text);

    expect(texts).toEqual([
      'Running with gitlab-runner 17.5.0 (66269445)',
      '  on docker-runner-1 t3_abc123, system ID: s_0e5f1a2b3c4d',
      'Preparing the "docker" executor',
      'Using Docker executor with image node:20-alpine ...',
      'Pulling docker image node:20-alpine ...',
      'Getting source from Git repository',
      'Fetching changes with git depth set to 20...',
      'Checking out 1a2b3c4d as detached HEAD (ref is main)...',
      'Executing "step_script" stage of the job script',
      '$ npm ci',
      'added 812 packages in 14s',
      'ERROR: Job failed: exit code 1',
    ]);
    for (const line of lines) {
      for (const seg of line.segments) {
        expect(seg.text).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f]/);
        expect(seg.text).not.toContain('section_');
      }
    }
    expect(lines.map((l) => l.lineNumber)).toEqual(texts.map((_, i) => i + 1));

    expect(sections.map((s) => [s.name, s.durationSeconds, s.headerIndex, s.lastIndex])).toEqual([
      ['prepare_executor', 7, 2, 4],
      ['get_sources', 3, 5, 7],
      ['step_script', 65, 8, 10],
    ]);
    expect(lines[2]).toMatchObject({ isSectionHeader: true, section: 0, depth: 0 });
    expect(lines[3]).toMatchObject({ isSectionHeader: false, section: 0, depth: 1 });
    expect(lines[11]).toMatchObject({ section: null, depth: 0 });
  });

  it('keeps colour/bold per segment and carries style across lines like a terminal', () => {
    const { lines } = parseJobLog(`plain ${E}[31mred${E}[1m bold-red\nstill red${E}[0m back`);
    expect(lines[0].segments).toEqual([
      { text: 'plain ', style: null },
      { text: 'red', style: { fg: 1 } },
      { text: ' bold-red', style: { fg: 1, bold: true } },
    ]);
    expect(lines[1].segments).toEqual([
      { text: 'still red', style: { fg: 1, bold: true } },
      { text: ' back', style: null },
    ]);
  });

  it('renders the header colour of a section', () => {
    const { lines } = parseJobLog(RUNNER_TRACE);
    expect(lines[2].segments).toEqual([
      { text: 'Preparing the "docker" executor', style: { fg: 6, bold: true } },
    ]);
  });

  it('supports nested and collapsed sections', () => {
    const log = [
      `section_start:100:build[collapsed=true]\r${E}[0KBuild`,
      'compiling',
      `section_start:105:tests\r${E}[0KTests`,
      'test 1',
      `section_end:130:tests\r${E}[0K`,
      'linking',
      `section_end:190:build\r${E}[0K`,
      'after',
    ].join('\n');
    const { lines, sections } = parseJobLog(log);
    expect(lines.map((l) => [l.text, l.depth, l.section])).toEqual([
      ['Build', 0, 0],
      ['compiling', 1, 0],
      ['Tests', 1, 1],
      ['test 1', 2, 1],
      ['linking', 1, 0],
      ['after', 0, null],
    ]);
    expect(sections[0]).toMatchObject({ name: 'build', collapsed: true, parent: null, headerIndex: 0, lastIndex: 4, durationSeconds: 90 });
    expect(sections[1]).toMatchObject({ name: 'tests', collapsed: false, parent: 0, headerIndex: 2, lastIndex: 3, durationSeconds: 25 });
  });

  it('reads hide_duration and falls back to the section name for an empty header', () => {
    const { lines, sections } = parseJobLog(
      `section_start:1:my_section[collapsed=false,hide_duration=true]\r${E}[0K\nbody\nsection_end:2:my_section\r${E}[0K`,
    );
    expect(sections[0]).toMatchObject({ collapsed: false, hideDuration: true });
    expect(lines[0].text).toBe('my_section');
  });

  it('leaves sections of a running job open with no duration', () => {
    const { sections } = parseJobLog(`section_start:1:step_script\r${E}[0KScript\n$ sleep 100`);
    expect(sections[0]).toMatchObject({ endedAt: null, durationSeconds: null, lastIndex: 1 });
  });

  it('closes inner sections when an outer one ends and ignores unknown section_end', () => {
    const log = [
      `section_start:1:outer\r${E}[0KOuter`,
      `section_start:2:inner\r${E}[0KInner`,
      'x',
      `section_end:9:nope\r${E}[0K`,
      `section_end:10:outer\r${E}[0K`,
      'y',
    ].join('\n');
    const { lines, sections } = parseJobLog(log);
    expect(sections.map((s) => s.durationSeconds)).toEqual([9, 8]);
    expect(lines[lines.length - 1]).toMatchObject({ text: 'y', depth: 0, section: null });
  });

  it('does not treat a marker without the trailing \\r as a section', () => {
    const { lines, sections } = parseJobLog('$ echo "section_start:1:x"');
    expect(sections).toHaveLength(0);
    expect(lines[0].text).toBe('$ echo "section_start:1:x"');
  });

  it('keeps the final state of \\r progress overwrites', () => {
    const { lines } = parseJobLog(
      'Downloading  10%\rDownloading  55%\rDownloading 100%\nUploading artifacts... \r' +
        `${E}[32mdone${E}[0m\nshort\rX`,
    );
    expect(lines[0].text).toBe('Downloading 100%');
    // Overwrite keeps untouched cells, exactly like a terminal.
    expect(lines[1].text).toBe('doneading artifacts... ');
    expect(lines[1].segments[0]).toEqual({ text: 'done', style: { fg: 2 } });
    expect(lines[2].text).toBe('Xhort');
  });

  it('honours erase-in-line after \\r (the usual progress idiom)', () => {
    const { lines } = parseJobLog(`Pulling fs layer\r${E}[KPull complete\r${E}[2K${E}[1Gdone`);
    expect(lines[0].text).toBe('done');
  });

  it('strips CRLF line endings, cursor moves, OSC, charset and other escapes', () => {
    const log =
      `a${E}[2Ab${E}[?25lc${E}]0;title\x07d${E}]8;;https://x.test${E}\\link${E}]8;;${E}\\e${E}(Bf${E}=g\x07\x00h\r\n` +
      `col${E}[5Gx`;
    const { lines } = parseJobLog(log);
    expect(lines[0].text).toBe('abcdlinkefgh');
    expect(lines[1].text).toBe('col x');
  });

  it('handles backspace and cursor-left overwrite', () => {
    const { lines } = parseJobLog(`abc\bX\nabcd${E}[2DZ`);
    expect(lines[0].text).toBe('abX');
    expect(lines[1].text).toBe('abZd');
  });

  it('keeps blank lines, drops only the trailing newline, and survives a truncated escape', () => {
    const { lines } = parseJobLog(`one\n\nthree\n${E}[31\nfour`);
    expect(lines.map((l) => l.text)).toEqual(['one', '', 'three', '', 'four']);
    // A final row made only of escape codes (runners end with ESC[0;m) is not shown.
    expect(parseJobLog(`done\n${E}[0;m\n`).lines.map((l) => l.text)).toEqual(['done']);
    expect(parseJobLog('').lines).toEqual([]);
    expect(parseJobLog('x\n').lines).toHaveLength(1);
  });

  it('keeps HTML in the log as inert text', () => {
    const { lines } = parseJobLog(`${E}[31m<script>alert(1)</script>${E}[0m <img src=x onerror=alert(2)>`);
    expect(lines[0].text).toBe('<script>alert(1)</script> <img src=x onerror=alert(2)>');
  });

  it('classifies lines for the level filter', () => {
    const { lines } = parseJobLog(RUNNER_TRACE);
    expect(lines.find((l) => l.text.startsWith('ERROR'))?.level).toBe('error');
    expect(lines.find((l) => l.text === '$ npm ci')?.level).toBe('info');
    expect(classifyLine('npm WARN deprecated foo')).toBe('warning');
    expect(classifyLine('✓ Compiled successfully')).toBe('success');
    expect(classifyLine('hello')).toBe('default');
  });

  it('parses a 100k-line coloured log with sections quickly', () => {
    const rows: string[] = [];
    for (let s = 0; s < 1000; s += 1) {
      rows.push(`section_start:${s}:step_${s}[collapsed=${s % 2 === 0}]\r${E}[0K${E}[36;1mStep ${s}${E}[0;m`);
      for (let k = 0; k < 98; k += 1) {
        rows.push(`${E}[32;1m$ run ${k}${E}[0;m output line with some text ${'x'.repeat(40)} ${k}%\r${k + 1}%`);
      }
      rows.push(`section_end:${s + 1}:step_${s}\r${E}[0K`);
    }
    const raw = rows.join('\n');
    const started = performance.now();
    const { lines, sections } = parseJobLog(raw);
    const elapsed = performance.now() - started;
    expect(lines).toHaveLength(99_000);
    expect(sections).toHaveLength(1000);
    // Generous bound for slow CI machines; locally this is far lower.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('helpers', () => {
  it('formats durations like GitLab', () => {
    expect(formatSectionDuration(7)).toBe('00:07');
    expect(formatSectionDuration(754)).toBe('12:34');
    expect(formatSectionDuration(3723)).toBe('1:02:03');
    expect(formatSectionDuration(-3)).toBe('00:00');
  });

  it('matches lines by level and case-insensitive term', () => {
    const [line] = parseJobLog('ERROR: Something Broke').lines;
    expect(lineMatches(line, '', 'all')).toBe(true);
    expect(lineMatches(line, 'broke', 'error')).toBe(true);
    expect(lineMatches(line, 'broke', 'warning')).toBe(false);
    expect(lineMatches(line, 'missing', 'all')).toBe(false);
  });
});
