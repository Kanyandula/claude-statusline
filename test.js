import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  readPayload,
  spatialLayout,
  contextBar, pctLabel, formatDuration, formatCost, formatLoc, sizeLabel,
} from './statusline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, 'fixtures', `${name}.json`), 'utf8');

// ── A1: adapter / view-model ────────────────────────────────────────────────
// readPayload(rawStdin) → flat, typed, null-tolerant ViewModel. Git fields are
// defaulted here (overlaid by the pipeline later). Every numeric field is null
// when absent or non-numeric — never NaN, never undefined.

test('full payload maps every field', () => {
  const vm = readPayload(fixture('full'));
  assert.equal(vm.projectName, 'claude-statusline');
  assert.equal(vm.modelName, 'Opus');           // display_name verbatim
  assert.equal(vm.modelShort, 'opus-4-8');       // derived from id, no model table
  assert.equal(vm.contextWindowSize, 200000);
  assert.equal(vm.ctxPct, 8);
  assert.equal(vm.remainingPct, 92);
  assert.equal(vm.inputTokens, 15500);
  assert.equal(vm.outputTokens, 1200);
  assert.equal(vm.exceeds200k, false);
  assert.equal(vm.costUsd, 8.4);
  assert.equal(vm.durationMs, 6420000);
  assert.equal(vm.apiDurationMs, 2300);
  assert.equal(vm.linesAdded, 342);
  assert.equal(vm.linesRemoved, 89);
  assert.equal(vm.outputStyle, 'default');
  assert.equal(vm.sessionId, 'abc123session');
  assert.deepEqual(vm.rateLimits, { fiveHour: 23.5, sevenDay: 41.2 });
  // git defaults — overlaid later, never undefined
  assert.equal(vm.branch, null);
  assert.equal(vm.dirty, false);
});

test('invalid stdin yields an all-null ViewModel without throwing', () => {
  for (const bad of ['', '   ', 'not json', '[]', 'null', undefined]) {
    const vm = readPayload(bad);
    assert.equal(vm.projectName, null);
    assert.equal(vm.modelName, null);
    assert.equal(vm.contextWindowSize, null);
    assert.equal(vm.ctxPct, null);
    assert.equal(vm.costUsd, null);
    assert.equal(vm.exceeds200k, false);
    assert.equal(vm.dirty, false);
    assert.deepEqual(vm.rateLimits, { fiveHour: null, sevenDay: null });
  }
});

test('null used_percentage stays null, never NaN (fresh session / post-compact)', () => {
  const vm = readPayload(JSON.stringify({ context_window: { used_percentage: null } }));
  assert.equal(vm.ctxPct, null);
});

test('missing context_window_size stays null (older CC build)', () => {
  const vm = readPayload(JSON.stringify({ context_window: { used_percentage: 50 } }));
  assert.equal(vm.contextWindowSize, null);
  assert.equal(vm.ctxPct, 50);
});

test('non-numeric numeric fields collapse to null, not NaN', () => {
  const vm = readPayload(JSON.stringify({
    cost: { total_cost_usd: '8.40', total_lines_added: null },
    context_window: { used_percentage: 'x' },
  }));
  assert.equal(vm.costUsd, null);
  assert.equal(vm.linesAdded, null);
  assert.equal(vm.ctxPct, null);
});

test('control chars in user-supplied strings are stripped (terminal-injection guard)', () => {
  const vm = readPayload(JSON.stringify({
    workspace: { current_dir: '/p/evil\x1b]0;PWNED\x07proj' },
    model: { display_name: 'Op\x1bus' },
    output_style: { name: 'def\x07ault' },
  }));
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(vm.projectName), 'projectName sanitized');
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(vm.modelName), 'modelName sanitized');
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(vm.outputStyle), 'outputStyle sanitized');
});

test('rate_limits absent → both windows null', () => {
  const vm = readPayload(JSON.stringify({ model: { display_name: 'Opus' } }));
  assert.deepEqual(vm.rateLimits, { fiveHour: null, sevenDay: null });
});

test('cwd is used when workspace.current_dir is absent', () => {
  const vm = readPayload(JSON.stringify({ cwd: '/a/b/myproj' }));
  assert.equal(vm.projectName, 'myproj');
});

test('display_name is taken verbatim, including a trailing context suffix', () => {
  const vm = readPayload(JSON.stringify({ model: { id: 'claude-opus-4-8', display_name: 'Opus 4.8 (1M context)' } }));
  assert.equal(vm.modelName, 'Opus 4.8 (1M context)');
});

test('modelShort strips claude- prefix and date/bracket suffixes', () => {
  const cases = [
    ['claude-opus-4-8', 'opus-4-8'],
    ['claude-sonnet-4-6', 'sonnet-4-6'],
    ['claude-haiku-4-5-20251001', 'haiku-4-5'],
    ['claude-opus-4-8[1m]', 'opus-4-8'],
  ];
  for (const [id, expected] of cases) {
    const vm = readPayload(JSON.stringify({ model: { id } }));
    assert.equal(vm.modelShort, expected, `id=${id}`);
  }
});

// ── A2: spatial layout (pure) ───────────────────────────────────────────────
// (viewModel, config) → string[]. No color, no I/O. Fixed-width metric fields,
// null fallbacks, progressive disclosure of the context-size label.

// pure formatters — exact output

test('contextBar fills 10 cells proportionally; null → empty bar', () => {
  assert.equal(contextBar(0), '▱▱▱▱▱▱▱▱▱▱');
  assert.equal(contextBar(8), '▰▱▱▱▱▱▱▱▱▱');      // round(0.8) = 1 cell
  assert.equal(contextBar(50), '▰▰▰▰▰▱▱▱▱▱');
  assert.equal(contextBar(100), '▰▰▰▰▰▰▰▰▰▰');
  assert.equal(contextBar(150), '▰▰▰▰▰▰▰▰▰▰');     // clamped
  assert.equal(contextBar(null), '▱▱▱▱▱▱▱▱▱▱');
});

test('pctLabel is fixed-width 4 chars; null → "--% "', () => {
  assert.equal(pctLabel(8), '8%  ');
  assert.equal(pctLabel(100), '100%');
  assert.equal(pctLabel(null), '--% ');
  for (const p of [0, 8, 100, null]) assert.equal(pctLabel(p).length, 4);
});

test('formatDuration auto-scales h/m/s; null → null', () => {
  assert.equal(formatDuration(6420000), '1h47m');   // 1h 47m
  assert.equal(formatDuration(3600000), '1h00m');
  assert.equal(formatDuration(420000), '7m');
  assert.equal(formatDuration(45000), '45s');
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(-5), null);
});

test('formatCost is "$x.xx" right-padded to a stable width; null → null', () => {
  assert.equal(formatCost(8.4), '$8.40  ');
  assert.equal(formatCost(123.4), '$123.40');
  assert.equal(formatCost(0), '$0.00  ');
  assert.equal(formatCost(null), null);
  assert.equal(formatCost(8.4).length, formatCost(123.4).length);
});

test('formatLoc uses +added / −removed (U+2212); both null → null', () => {
  assert.equal(formatLoc(342, 89), '+342 / −89');
  assert.equal(formatLoc(0, 0), '+0 / −0');
  assert.equal(formatLoc(null, null), null);
});

test('sizeLabel humanizes window size; null → null', () => {
  assert.equal(sizeLabel(1000000), '1M');
  assert.equal(sizeLabel(200000), '200K');
  assert.equal(sizeLabel(500000), '500K');
  assert.equal(sizeLabel(null), null);
});

// composition — the two-line spatial layout

const vmFull = readPayload(fixture('full'));

test('spatial returns exactly two lines, no ANSI', () => {
  const lines = spatialLayout(vmFull);
  assert.equal(lines.length, 2);
  for (const l of lines) assert.ok(!/\x1b/.test(l), 'no escape codes in layout');
});

test('identity line: pixel + project + model; default window hides size label', () => {
  const [identity] = spatialLayout(vmFull);
  assert.ok(identity.startsWith('▌ '), 'starts with health pixel glyph');
  assert.ok(identity.includes('claude-statusline'));
  assert.ok(identity.includes('Opus'));
  assert.ok(!/\b1M\b|200K/.test(identity), 'no size label when window == default');
  assert.ok(!identity.includes('· ·') && !identity.includes('·  ·'), 'null branch leaves no empty field');
});

test('state line carries ctx bar+pct, duration, cost, LOC', () => {
  const [, state] = spatialLayout(vmFull);
  assert.ok(state.includes('ctx '));
  assert.ok(state.includes('▰▱▱▱▱▱▱▱▱▱'));
  assert.ok(state.includes('8%'));
  assert.ok(state.includes('1h47m'));
  assert.ok(state.includes('$8.40'));
  assert.ok(state.includes('+342 / −89'));
});

test('null used_percentage → placeholder bar + --%, still rendered', () => {
  const vm = readPayload(JSON.stringify({ context_window: { used_percentage: null }, cost: { total_cost_usd: 1 } }));
  const [, state] = spatialLayout(vm);
  assert.ok(state.includes('▱▱▱▱▱▱▱▱▱▱'));
  assert.ok(state.includes('--%'));
});

test('progressive disclosure: non-default window shows the size label', () => {
  const vm = readPayload(JSON.stringify({ workspace: { current_dir: '/x/proj' }, model: { display_name: 'Opus' }, context_window: { context_window_size: 1000000 } }));
  const [identity] = spatialLayout(vm);
  assert.ok(identity.includes('1M'), 'shows 1M for extended window');
});

test('branch is shown on the identity line once overlaid', () => {
  const vm = { ...vmFull, branch: 'main' };
  const [identity] = spatialLayout(vm);
  assert.ok(identity.includes('main'));
});

test('suppressed cost is omitted from the state line', () => {
  const vm = { ...vmFull, costUsd: null };
  const [, state] = spatialLayout(vm);
  assert.ok(!state.includes('$'));
});

test('config.separators overrides the field separator', () => {
  const [identity] = spatialLayout(vmFull, { separators: '|' });
  assert.ok(identity.includes('|'));
  assert.ok(!identity.includes('·'));
});

// ── A3: threshold → color + health pixel ────────────────────────────────────
// colorize(vm, config, useColour) wraps fields in ANSI by threshold band. One
// severity mapping (green→yellow→red, dim=no-signal) drives every field AND the
// health pixel (which takes the WORST active threshold). Defaults: context
// 60/85, cost $5/$20.

import { colorize, severity } from './statusline.js';

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const SGR = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };
const vmOf = (o) => readPayload(JSON.stringify(o));

test('severity bands: <warn green, ≥warn yellow, ≥danger red, null no-signal', () => {
  assert.equal(severity(8, 60, 85), 0);    // green
  assert.equal(severity(60, 60, 85), 1);   // yellow at boundary
  assert.equal(severity(85, 60, 85), 2);   // red at boundary
  assert.equal(severity(null, 60, 85), -1); // no signal
});

test('stripping ANSI from a colorized layout yields the exact structure layout', () => {
  const vm = { ...vmFull, branch: 'v2' };
  const colored = colorize(vm, {}, true);
  const structure = spatialLayout(vm, {});
  assert.deepEqual(colored.map(strip), structure);
});

test('useColour=false emits no escape codes (identical to structure)', () => {
  const vm = { ...vmFull, branch: 'v2' };
  assert.deepEqual(colorize(vm, {}, false), spatialLayout(vm, {}));
});

test('ctx field colored by band: green low, yellow ≥60, red ≥85, dim when null', () => {
  const ctxLine = (pct) => colorize(vmOf({ context_window: { used_percentage: pct } }), {}, true)[1];
  assert.ok(ctxLine(8).includes(SGR.green));
  assert.ok(ctxLine(70).includes(SGR.yellow));
  assert.ok(ctxLine(90).includes(SGR.red));
  assert.ok(ctxLine(null).includes(SGR.dim));   // placeholder bar is dim, not red
});

test('cost field colored by band: green <$5, yellow ≥$5, red ≥$20', () => {
  const costLine = (usd) => colorize(vmOf({ cost: { total_cost_usd: usd } }), {}, true)[1];
  assert.ok(costLine(1).includes(SGR.green));
  assert.ok(costLine(8).includes(SGR.yellow));
  assert.ok(costLine(25).includes(SGR.red));
});

test('health pixel takes the worst active threshold', () => {
  const pixel = (o) => colorize(vmOf(o), {}, true)[0];
  // ctx green + cost red → red pixel
  assert.ok(pixel({ context_window: { used_percentage: 8 }, cost: { total_cost_usd: 25 } }).startsWith(SGR.red));
  // ctx yellow + cost green → yellow pixel
  assert.ok(pixel({ context_window: { used_percentage: 70 }, cost: { total_cost_usd: 1 } }).startsWith(SGR.yellow));
  // both green → green pixel
  assert.ok(pixel({ context_window: { used_percentage: 8 }, cost: { total_cost_usd: 1 } }).startsWith(SGR.green));
});

test('fresh session (null ctx, null cost) → dim pixel, never red', () => {
  const pixel = colorize(vmOf({ model: { display_name: 'Opus' } }), {}, true)[0];
  assert.ok(pixel.startsWith(SGR.dim), 'pixel is dim with no signal');
  assert.ok(!pixel.includes(SGR.red) && !pixel.includes(SGR.yellow));
});

test('identity fields (project/model) are not threshold-colored — only the pixel is', () => {
  const [identity] = colorize({ ...vmFull, branch: 'v2' }, {}, true);
  // project/branch/model appear as plain substrings (no SGR wrapping them)
  assert.ok(identity.includes(' claude-statusline '), 'project is plain');
  assert.ok(identity.includes('Opus'), 'model present');
  // the only colored segment on the identity line is the leading pixel
  assert.equal(identity.indexOf('\x1b'), 0, 'first color code is the pixel at position 0');
  assert.equal(strip(identity).indexOf('\x1b'), -1);
});

test('custom thresholds shift the bands', () => {
  const line = colorize(vmOf({ cost: { total_cost_usd: 8 } }), { thresholds: { cost: { warn: 10, danger: 30 } } }, true)[1];
  assert.ok(line.includes(SGR.green), '$8 is green when warn raised to $10');
});

// ── A4: golden tests through the real entry point ───────────────────────────
// Pipe stdin through the actual statusline.js process — the live path, not a
// mocked render. Structure asserted with color off (piped stdout → no TTY →
// no color); threshold transitions asserted with FORCE_COLOR on.

import { spawnSync } from 'node:child_process';

const ENTRY = join(HERE, 'statusline.js');
function runEntry(input, { color = false } = {}) {
  const env = { ...process.env, NO_COLOR: '', FORCE_COLOR: color ? '1' : '' };
  if (!color) delete env.FORCE_COLOR;
  const r = spawnSync(process.execPath, [ENTRY], { input, encoding: 'utf8', env });
  assert.equal(r.status, 0, `entry exited ${r.status}: ${r.stderr}`);
  return r.stdout.replace(/\n$/, '');
}
const pipe = (obj, opts) => runEntry(JSON.stringify(obj), opts);

test('golden: full fixture → exact spatial structure (color off)', () => {
  const out = runEntry(fixture('full'));
  assert.deepEqual(out.split('\n'), [
    '▌ claude-statusline · Opus',
    'ctx ▰▱▱▱▱▱▱▱▱▱ 8%   · ⏱ 1h47m · $8.40   · +342 / −89',
  ]);
});

test('golden: full fixture color-on strips back to the exact structure', () => {
  const plain = runEntry(fixture('full'));
  const colored = runEntry(fixture('full'), { color: true });
  assert.notEqual(colored, plain, 'color actually applied');
  assert.equal(colored.replace(/\x1b\[[0-9;]*m/g, ''), plain);
  // cost $8.40 (yellow) is the worst band → yellow pixel
  assert.ok(colored.startsWith('\x1b[33m▌'));
});

test('golden: empty payload → pixel + placeholder bar, no stray fields', () => {
  assert.deepEqual(pipe({}).split('\n'), ['▌', 'ctx ▱▱▱▱▱▱▱▱▱▱ --%']);
});

test('golden: ctx band transitions at 59/60/84/85 (color on)', () => {
  const band = (pct) => pipe({ context_window: { used_percentage: pct } }, { color: true }).split('\n')[1];
  assert.ok(band(59).includes('\x1b[32m'), '59 green');
  assert.ok(band(60).includes('\x1b[33m'), '60 yellow');
  assert.ok(band(84).includes('\x1b[33m'), '84 yellow');
  assert.ok(band(85).includes('\x1b[31m'), '85 red');
});

test('golden: cost band transitions at $4.99/$5/$19.99/$20 (color on)', () => {
  const band = (usd) => pipe({ cost: { total_cost_usd: usd } }, { color: true }).split('\n')[1];
  assert.ok(band(4.99).includes('\x1b[32m'), '$4.99 green');
  assert.ok(band(5).includes('\x1b[33m'), '$5 yellow');
  assert.ok(band(19.99).includes('\x1b[33m'), '$19.99 yellow');
  assert.ok(band(20).includes('\x1b[31m'), '$20 red');
});

test('golden: non-default (1M) window shows the size label', () => {
  const id = pipe({ workspace: { current_dir: '/x/proj' }, model: { display_name: 'Opus' }, context_window: { context_window_size: 1000000 } }).split('\n')[0];
  assert.ok(id.includes('· 1M'));
});

test('golden: over-long project name is truncated with an ellipsis', () => {
  const longName = 'a-really-very-extremely-long-project-directory-name';
  const id = pipe({ workspace: { current_dir: `/x/${longName}` } }).split('\n')[0];
  assert.ok(id.includes('…'), 'truncated with ellipsis');
  assert.ok(!id.includes(longName), 'full name not shown');
});

test('golden: zero cost / zero duration renders without crashing', () => {
  const out = pipe({ cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 } });
  assert.ok(out.split('\n')[1].includes('$0.00'));
});

test('golden: malformed stdin still emits a valid (empty) bar, exit 0', () => {
  assert.deepEqual(runEntry('not json at all').split('\n'), ['▌', 'ctx ▱▱▱▱▱▱▱▱▱▱ --%']);
});

// ── A5: install wiring (cli.js init/uninstall) + forced color ────────────────

import { mkdtempSync, writeFileSync as wf, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { init, uninstall, statusLineBlock, STATUSLINE_PATH } from './cli.js';

const tmpSettings = () => join(mkdtempSync(join(tmpdir(), 'cs-')), 'settings.json');

test('forced color: --color makes the piped (non-TTY) entry emit ANSI', () => {
  const r = spawnSync(process.execPath, [ENTRY, '--color'], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '', NO_COLOR: '' },
  });
  assert.equal(r.status, 0);
  assert.ok(/\x1b\[/.test(r.stdout), 'color present despite non-TTY stdout');
});

test('--no-color forces plain even under FORCE_COLOR', () => {
  const r = spawnSync(process.execPath, [ENTRY, '--no-color'], {
    input: fixture('full'), encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' },
  });
  assert.ok(!/\x1b\[/.test(r.stdout), 'no escapes with --no-color');
});

test('statusLineBlock points at statusline.js and forces --color', () => {
  const b = statusLineBlock();
  assert.equal(b.type, 'command');
  assert.ok(b.command.startsWith('node '));
  assert.ok(b.command.includes(STATUSLINE_PATH));
  assert.ok(b.command.includes('--color'), 'install forces color on');
  assert.ok(existsSync(STATUSLINE_PATH), 'target script exists');
});

test('init writes the statusLine block and preserves other settings keys', () => {
  const p = tmpSettings();
  wf(p, JSON.stringify({ model: 'opus', permissions: { allow: ['x'] } }));
  const r = init({ path: p });
  assert.ok(r.ok);
  const s = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(s.model, 'opus');                    // untouched
  assert.deepEqual(s.permissions, { allow: ['x'] }); // untouched
  assert.ok(s.statusLine.command.includes('--color'));
});

test('init refuses an existing statusLine unless --force', () => {
  const p = tmpSettings();
  wf(p, JSON.stringify({ statusLine: { type: 'command', command: 'old' } }));
  assert.equal(init({ path: p }).ok, false);                       // refused
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).statusLine.command, 'old');
  assert.ok(init({ path: p, force: true }).ok);                    // forced
  assert.ok(JSON.parse(readFileSync(p, 'utf8')).statusLine.command.includes('--color'));
});

test('init backs up an existing settings file once', () => {
  const p = tmpSettings();
  wf(p, JSON.stringify({ model: 'opus' }));
  init({ path: p });
  const baks = readdirSync(dirname(p)).filter((f) => f.includes('settings.json.bak.'));
  assert.equal(baks.length, 1, 'one backup created');
});

test('init creates a valid settings.json when none exists (trailing newline)', () => {
  const p = tmpSettings();
  assert.ok(init({ path: p }).ok);
  const raw = readFileSync(p, 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('uninstall removes statusLine, preserves other keys, idempotent', () => {
  const p = tmpSettings();
  wf(p, JSON.stringify({ model: 'opus', statusLine: { type: 'command', command: 'x' } }));
  const r1 = uninstall({ path: p });
  assert.ok(r1.ok && r1.removed);
  const s = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(s.model, 'opus');
  assert.ok(!('statusLine' in s));
  const r2 = uninstall({ path: p });          // idempotent
  assert.ok(r2.ok && !r2.removed);
});

// ── A6: README / license consistency ────────────────────────────────────────

test('README leads with install.sh; npm is framed as deferred, never the headline', () => {
  const readme = readFileSync(join(HERE, 'README.md'), 'utf8');
  const curlIdx = readme.indexOf('curl -fsSL');
  const npmIdx = readme.indexOf('npm i -g @kanyandula/claude-statusline');
  assert.ok(curlIdx > -1, 'install.sh curl present');
  assert.ok(npmIdx > -1, 'npm command mentioned');
  assert.ok(curlIdx < npmIdx, 'install.sh appears before the npm command (locked sequencing)');
  const around = readme.slice(Math.max(0, npmIdx - 220), npmIdx + 220);
  assert.ok(/coming soon|resolves to \*\*v1\*\*/i.test(around), 'npm framed as coming-soon / resolves-to-v1');
});

test('package metadata is MIT and the license file matches', () => {
  const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
  assert.equal(pkg.license, 'MIT');
  assert.ok(readFileSync(join(HERE, 'LICENSE'), 'utf8').startsWith('MIT License'));
});

// ── B3: git overlay ─────────────────────────────────────────────────────────
// A single ~1s-bounded `git status --porcelain=v2 --branch` (plain — no
// fsmonitor override), parsed to {branch, upstream, ahead, behind, dirty}.
// try/catch + timeout → null (no git segment). The entry overlays it onto the
// view-model before render.

import { parseGitStatus, gitInfo, branchLabel } from './statusline.js';

function tempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'csgit-'));
  const run = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  run(['init', '-b', 'work']);
  run(['config', 'user.email', 't@t']);
  run(['config', 'user.name', 't']);
  run(['config', 'commit.gpgsign', 'false']);
  wf(join(dir, 'a.txt'), 'hi');
  run(['add', '.']);
  run(['commit', '-m', 'init']);
  return { dir, run };
}

test('parseGitStatus reads branch, upstream, ahead/behind, and dirty', () => {
  const out = [
    '# branch.oid abc123',
    '# branch.head work',
    '# branch.upstream origin/work',
    '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 aaa bbb a.txt',
  ].join('\n');
  const g = parseGitStatus(out);
  assert.equal(g.branch, 'work');
  assert.equal(g.upstream, 'origin/work');
  assert.equal(g.ahead, 2);
  assert.equal(g.behind, 1);
  assert.equal(g.dirty, true);
});

test('parseGitStatus: clean repo, no upstream → zeros and not dirty', () => {
  const g = parseGitStatus('# branch.oid abc\n# branch.head main\n');
  assert.equal(g.branch, 'main');
  assert.equal(g.upstream, null);
  assert.equal(g.ahead, 0);
  assert.equal(g.behind, 0);
  assert.equal(g.dirty, false);
});

test('parseGitStatus: untracked file counts as dirty', () => {
  assert.equal(parseGitStatus('# branch.head main\n? newfile.txt\n').dirty, true);
});

test('parseGitStatus strips control chars from the branch name (injection guard)', () => {
  const g = parseGitStatus('# branch.head wo\x1b]0;x\x07rk\n');
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(g.branch));
});

test('gitInfo reads a real repo and tracks the dirty transition', () => {
  const { dir } = tempGitRepo();
  let g = gitInfo(dir);
  assert.equal(g.branch, 'work');
  assert.equal(g.dirty, false);
  wf(join(dir, 'a.txt'), 'changed');
  g = gitInfo(dir);
  assert.equal(g.dirty, true);
});

test('gitInfo returns null for a missing/non-git dir (degrade to no segment)', () => {
  assert.equal(gitInfo('/nonexistent/definitely/not/a/repo'), null);
  assert.equal(gitInfo(null), null);
});

test('branchLabel composes name + dirty star + ahead/behind', () => {
  assert.equal(branchLabel({ branch: 'main', dirty: false, ahead: 0, behind: 0 }), 'main');
  assert.equal(branchLabel({ branch: 'main', dirty: true, ahead: 0, behind: 0 }), 'main*');
  assert.equal(branchLabel({ branch: 'main', dirty: true, ahead: 2, behind: 1 }), 'main* ↑2 ↓1');
  assert.equal(branchLabel({ branch: null }), null);
});

test('spatial identity shows the composed branch label when overlaid', () => {
  const [id] = spatialLayout({ ...vmFull, branch: 'work', dirty: true, ahead: 2, behind: 1 });
  assert.ok(id.includes('work*'));
  assert.ok(id.includes('↑2') && id.includes('↓1'));
});

test('golden: the entry overlays a real repo branch onto the identity line', () => {
  const { dir } = tempGitRepo();
  const id = pipe({ workspace: { current_dir: dir }, model: { display_name: 'Opus' } }).split('\n')[0];
  assert.ok(id.includes('work'), `branch overlaid: ${id}`);
});
