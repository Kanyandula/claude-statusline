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

test('a trailing context suffix in display_name is stripped (size label is the single source)', () => {
  // Real CC sends e.g. "Opus 4.8 (1M context)"; the derived size label already
  // shows the window, so the embedded one would double it.
  assert.equal(readPayload(JSON.stringify({ model: { display_name: 'Opus 4.8 (1M context)' } })).modelName, 'Opus 4.8');
  assert.equal(readPayload(JSON.stringify({ model: { display_name: 'Sonnet 4.6 (200K context)' } })).modelName, 'Sonnet 4.6');
  assert.equal(readPayload(JSON.stringify({ model: { display_name: 'Opus' } })).modelName, 'Opus'); // no suffix → unchanged
});

test('model + non-default window render the size exactly once (no doubling)', () => {
  const vm = readPayload(JSON.stringify({
    workspace: { current_dir: '/x/proj' },
    model: { display_name: 'Opus 4.8 (1M context)' },
    context_window: { context_window_size: 1000000 },
  }));
  const [id] = spatialLayout(vm);
  assert.ok(id.includes('Opus 4.8 · 1M'), id);
  assert.ok(!id.includes('context'), 'no embedded context suffix');
  assert.equal((id.match(/1M/g) || []).length, 1, 'size shown once');
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
// Point config loading at a path that can't exist, so golden tests render with
// defaults regardless of any real ~/.claude/statusline.json on the dev box.
const NO_USER_CONFIG = '/nonexistent/cs-test-no-config.json';
function runEntry(input, { color = false } = {}) {
  const env = { ...process.env, NO_COLOR: '', FORCE_COLOR: color ? '1' : '', CLAUDE_STATUSLINE_CONFIG: NO_USER_CONFIG };
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
    env: { ...process.env, FORCE_COLOR: '', NO_COLOR: '', CLAUDE_STATUSLINE_CONFIG: NO_USER_CONFIG },
  });
  assert.equal(r.status, 0);
  assert.ok(/\x1b\[/.test(r.stdout), 'color present despite non-TTY stdout');
});

test('--no-color forces plain even under FORCE_COLOR', () => {
  const r = spawnSync(process.execPath, [ENTRY, '--no-color'], {
    input: fixture('full'), encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: NO_USER_CONFIG },
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

// ── B5: config loader (defaults → user file → env, normalized) ──────────────

import { loadConfig, DEFAULT_CONFIG } from './statusline.js';

const tmpConfig = (obj) => {
  const p = join(mkdtempSync(join(tmpdir(), 'cscfg-')), 'statusline.json');
  wf(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};

test('loadConfig returns defaults when no file is present', () => {
  const c = loadConfig({ userPath: '/nonexistent/x.json', env: {} });
  assert.equal(c.layout, 'spatial');
  assert.equal(c.separators, '·');
  assert.equal(c.defaultWindowSize, 200000);
  assert.deepEqual(c.thresholds.context, { warn: 60, danger: 85 });
  assert.deepEqual(c.thresholds.cost, { warn: 5, danger: 20 });
  assert.equal(c.fields.gitAheadBehind, true);
  assert.equal(c.fields.burnRate, false);
});

test('user file overrides defaults; unspecified keys keep their defaults', () => {
  const c = loadConfig({ userPath: tmpConfig({ separators: '|', thresholds: { cost: { warn: 10 } } }), env: {} });
  assert.equal(c.separators, '|');
  assert.equal(c.thresholds.cost.warn, 10);
  assert.equal(c.thresholds.cost.danger, 20);          // default preserved
  assert.deepEqual(c.thresholds.context, { warn: 60, danger: 85 });
});

test('env CLAUDE_STATUSLINE_CONFIG selects the user file path', () => {
  const p = tmpConfig({ separators: '+' });
  const c = loadConfig({ env: { CLAUDE_STATUSLINE_CONFIG: p } });
  assert.equal(c.separators, '+');
});

test('config path must be absolute and .json (else ignored)', () => {
  assert.equal(loadConfig({ userPath: 'relative.json', env: {} }).separators, '·');
  assert.equal(loadConfig({ userPath: '/etc/passwd', env: {} }).separators, '·');
});

test('normalize clamps wrong-typed values back to defaults', () => {
  const c = loadConfig({ userPath: tmpConfig({
    separators: 123,
    maxProjectWidth: -5,
    thresholds: { context: { warn: 'high' } },
    fields: { gitAheadBehind: 'yes' },
  }), env: {} });
  assert.equal(c.separators, '·');
  assert.equal(c.maxProjectWidth, DEFAULT_CONFIG.maxProjectWidth);
  assert.equal(c.thresholds.context.warn, 60);
  assert.equal(c.fields.gitAheadBehind, true);
});

test('unknown keys are dropped (schema stays true)', () => {
  const c = loadConfig({ userPath: tmpConfig({ bogus: 1, layout: 'spatial' }), env: {} });
  assert.ok(!('bogus' in c));
});

test('an invalid layout falls back to spatial', () => {
  const c = loadConfig({ userPath: tmpConfig({ layout: 'hologram' }), env: {} });
  assert.equal(c.layout, 'spatial');
});

test('gitAheadBehind:false hides ahead/behind on the identity line', () => {
  const vm = { ...vmFull, branch: 'work', dirty: true, ahead: 2, behind: 1 };
  const [withAB] = spatialLayout(vm, { fields: { gitAheadBehind: true } });
  const [withoutAB] = spatialLayout(vm, { fields: { gitAheadBehind: false } });
  assert.ok(withAB.includes('↑2') && withAB.includes('↓1'));
  assert.ok(withoutAB.includes('work*') && !withoutAB.includes('↑2') && !withoutAB.includes('↓1'));
});

test('loaded config drives colorize thresholds end to end', () => {
  const cfg = loadConfig({ userPath: tmpConfig({ thresholds: { cost: { warn: 10 } } }), env: {} });
  const line = colorize(vmOf({ cost: { total_cost_usd: 8 } }), cfg, true)[1];
  assert.ok(line.includes('\x1b[32m'), '$8 is green when warn is raised to $10');
});

// ── B2: burn-rate (session-average $/h, opt-in) ─────────────────────────────
// rate = total_cost_usd / (total_duration_ms / 3.6e6). Wall-clock denominator
// (idle time is still spend). Stateless, labeled an average. Off by default;
// self-suppresses when cost is null or duration is 0.

import { formatBurnRate } from './statusline.js';

test('formatBurnRate computes session-average $/h; the plan example checks out', () => {
  assert.equal(formatBurnRate(8.4, 6420000), '↑$4.7/h');   // $8.40 over 1h47m → 4.71
  assert.equal(formatBurnRate(8.4, 7200000), '↑$4.2/h');   // $8.40 over 2h
  assert.equal(formatBurnRate(100, 3600000), '↑$100/h');   // ≥10 → integer
});

test('formatBurnRate self-suppresses on null cost or zero/absent duration', () => {
  assert.equal(formatBurnRate(null, 6420000), null);
  assert.equal(formatBurnRate(8.4, 0), null);
  assert.equal(formatBurnRate(8.4, null), null);
});

test('burn-rate is off by default, shown when the field is enabled', () => {
  const [, offState] = spatialLayout(vmFull, {});
  assert.ok(!offState.includes('/h'), 'absent by default');
  const [, onState] = spatialLayout(vmFull, { fields: { burnRate: true } });
  assert.ok(onState.includes('↑$4.7/h'), 'shown when enabled');
});

test('burn-rate field self-suppresses even when enabled if duration is 0', () => {
  const vm = readPayload(JSON.stringify({ cost: { total_cost_usd: 5, total_duration_ms: 0 } }));
  const [, state] = spatialLayout(vm, { fields: { burnRate: true } });
  assert.ok(!state.includes('/h'));
});

test('golden: burn-rate renders through the entry when configured on', () => {
  const cfgPath = tmpConfig({ fields: { burnRate: true } });
  const r = spawnSync(process.execPath, [ENTRY], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: cfgPath, FORCE_COLOR: '' },
  });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('↑$4.7/h'), `burn-rate present: ${r.stdout}`);
});

// ── B1: compact / zen layouts ───────────────────────────────────────────────
// Arrangements over one shared field source — not separate render code paths.
// compact = spatial's fields on one line; zen = project · model · ctx% · cost,
// color as the only escalation signal.

import { compactLayout, zenLayout } from './statusline.js';

const stripAll = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

test('compact: one line carrying the spatial fields', () => {
  const lines = compactLayout({ ...vmFull, branch: 'v2' });
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.ok(l.startsWith('▌ '));
  for (const s of ['claude-statusline', 'v2', 'Opus', 'ctx ', '8%', '1h47m', '$8.40', '+342 / −89']) {
    assert.ok(l.includes(s), `compact includes ${s}`);
  }
});

test('zen: project · model · ctx% · cost only — no bar, branch, duration, or loc', () => {
  const lines = zenLayout({ ...vmFull, branch: 'v2' });
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.ok(l.includes('claude-statusline') && l.includes('Opus') && l.includes('8%') && l.includes('$8.40'));
  assert.ok(!l.includes('▰') && !l.includes('ctx '), 'no context bar');
  assert.ok(!l.includes('1h47m') && !l.includes('+342'), 'no duration/loc');
  assert.ok(!l.includes('v2'), 'no branch in zen');
});

test('colorize dispatches on config.layout', () => {
  assert.equal(colorize(vmFull, { layout: 'compact' }, false).length, 1);
  assert.equal(colorize(vmFull, { layout: 'zen' }, false).length, 1);
  assert.equal(colorize(vmFull, { layout: 'spatial' }, false).length, 2);
  assert.equal(colorize(vmFull, {}, false).length, 2);                    // default spatial
});

test('compact and zen are accepted as configured layouts', () => {
  assert.equal(loadConfig({ userPath: tmpConfig({ layout: 'compact' }), env: {} }).layout, 'compact');
  assert.equal(loadConfig({ userPath: tmpConfig({ layout: 'zen' }), env: {} }).layout, 'zen');
});

test('strip-to-structure invariant holds for compact and zen too', () => {
  for (const layout of ['compact', 'zen']) {
    const vm = { ...vmFull, branch: 'v2' };
    const colored = colorize(vm, { layout }, true);
    const structure = colorize(vm, { layout }, false);
    assert.deepEqual(colored.map(stripAll), structure, `${layout} strips to structure`);
  }
});

test('zen pixel still reflects the worst threshold (color is the signal)', () => {
  const vm = vmOf({ context_window: { used_percentage: 90 }, cost: { total_cost_usd: 1 } });
  assert.ok(colorize(vm, { layout: 'zen' }, true)[0].startsWith('\x1b[31m'), 'red pixel at 90% ctx');
});

test('golden: layout=compact renders a single line through the entry', () => {
  const cfgPath = tmpConfig({ layout: 'compact' });
  const r = spawnSync(process.execPath, [ENTRY], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: cfgPath, FORCE_COLOR: '' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.replace(/\n$/, '').split('\n').length, 1);
});

// ── Theme / vivid palette (opt-in, matches the design mock) ──────────────────
// Default 'minimal' = current ANSI behavior (identity plain, only ctx/cost/pixel
// threshold-colored). 'vivid' = the mock: truecolor hex, colored identity, split
// green/red LOC, purple-calm→red brand pixel. Both keep the strip→structure
// invariant.

import { wrap } from './statusline.js';

test('wrap supports truecolor hex and still supports ANSI names', () => {
  assert.equal(wrap('#bc8cff', 'x'), '\x1b[38;2;188;140;255mx\x1b[0m');
  assert.equal(wrap('green', 'x'), '\x1b[32mx\x1b[0m');               // unchanged
  assert.equal(wrap(['bold', '#ff7bd5'], 'x'), '\x1b[1;38;2;255;123;213mx\x1b[0m');
});

test('vivid colors the identity (pink project, blue model) — minimal leaves it plain', () => {
  const [vividId] = colorize(vmFull, { theme: 'vivid' }, true);
  assert.ok(vividId.includes('\x1b[1;38;2;255;123;213m'), 'project pink+bold');
  assert.ok(vividId.includes('38;2;88;166;255'), 'model blue');
  const [minId] = colorize(vmFull, {}, true);
  assert.ok(minId.includes(' claude-statusline '), 'minimal project stays plain');
});

test('vivid pixel is calm purple until danger, then red', () => {
  const calm = colorize(vmOf({ context_window: { used_percentage: 62 }, cost: { total_cost_usd: 8 } }), { theme: 'vivid' }, true)[0];
  assert.ok(calm.startsWith('\x1b[38;2;188;140;255m▌'), 'purple at warn band');
  const danger = colorize(vmOf({ context_window: { used_percentage: 94 } }), { theme: 'vivid' }, true)[0];
  assert.ok(danger.startsWith('\x1b[38;2;248;81;73m▌'), 'red at danger');
});

test('vivid splits LOC into green added / red removed', () => {
  const [, state] = colorize(vmFull, { theme: 'vivid' }, true);
  assert.ok(state.includes('38;2;63;185;80'), 'added green');
  assert.ok(state.includes('38;2;248;81;73'), 'removed red');
});

test('strip-to-structure invariant holds for vivid', () => {
  const vm = { ...vmFull, branch: 'v2' };
  for (const layout of ['spatial', 'compact', 'zen']) {
    const colored = colorize(vm, { theme: 'vivid', layout }, true);
    const structure = colorize(vm, { theme: 'vivid', layout }, false);
    assert.deepEqual(colored.map((s) => s.replace(/\x1b\[[0-9;]*m/g, '')), structure);
  }
});

test('config selects the theme; unknown theme falls back to minimal', () => {
  assert.equal(loadConfig({ userPath: tmpConfig({ theme: 'vivid' }), env: {} }).theme, 'vivid');
  assert.equal(loadConfig({ userPath: tmpConfig({ theme: 'neon' }), env: {} }).theme, 'minimal');
  assert.equal(loadConfig({ userPath: '/nonexistent.json', env: {} }).theme, 'minimal');
});

test('golden: theme=vivid emits truecolor through the entry', () => {
  const cfgPath = tmpConfig({ theme: 'vivid', colorDepth: 'truecolor' });
  const r = spawnSync(process.execPath, [ENTRY, '--color'], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: cfgPath, FORCE_COLOR: '' },
  });
  assert.equal(r.status, 0);
  assert.ok(/\x1b\[38;2;/.test(r.stdout), 'truecolor present');
});

// ── Powerline layout (mock direction C — opt-in, needs a Nerd Font) ──────────
// Background-filled segments joined by the powerline arrow . Distinct render
// path (backgrounds, not fg painting); still strips to a stable structure.

import { powerlineLayout } from './statusline.js';
const PL = '';

test('powerline: one line of segments joined by the arrow glyph', () => {
  const lines = powerlineLayout({ ...vmFull, branch: 'main' }, {}, false);
  assert.equal(lines.length, 1);
  const l = lines[0];
  for (const s of ['claude-statusline', '⎇ main', 'Opus', '● 8%', '$8.40', '+342/−89']) {
    assert.ok(l.includes(s), `powerline includes ${s}`);
  }
  assert.ok(l.includes(PL), 'has the powerline separator');
});

test('powerline colored uses truecolor backgrounds and strips to the structure', () => {
  const vm = { ...vmFull, branch: 'main' };
  const colored = powerlineLayout(vm, {}, true)[0];
  const plain = powerlineLayout(vm, {}, false)[0];
  assert.ok(/48;2;/.test(colored), 'has a background color');
  assert.equal(colored.replace(/\x1b\[[0-9;]*m/g, ''), plain);
});

test('powerline ctx/cost segment background reflects threshold severity', () => {
  const danger = powerlineLayout(vmOf({ context_window: { used_percentage: 94 } }), {}, true)[0];
  assert.ok(danger.includes('48;2;218;54;51'), 'red background at danger');
});

test('colorize and config dispatch to powerline', () => {
  assert.equal(colorize(vmFull, { layout: 'powerline' }, false).length, 1);
  assert.equal(loadConfig({ userPath: tmpConfig({ layout: 'powerline' }), env: {} }).layout, 'powerline');
});

test('golden: layout=powerline renders through the entry', () => {
  const cfgPath = tmpConfig({ layout: 'powerline', colorDepth: 'truecolor' });
  const r = spawnSync(process.execPath, [ENTRY, '--color'], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: cfgPath, FORCE_COLOR: '' },
  });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(PL) && /48;2;/.test(r.stdout));
});

// ── colorDepth: 256-color fallback (cross-terminal consistency) ──────────────
// Hex colors downsample to xterm-256 (38;5;N / 48;5;N) when depth is '256', so
// vivid/powerline render (approximately) on non-truecolor terminals like
// Apple Terminal. Auto-detect engages 256 for TERM_PROGRAM=Apple_Terminal only;
// config.colorDepth overrides. Pure colorize/wrap default to truecolor.

import { resolveColorDepth } from './statusline.js';

test('wrap downsamples hex to xterm-256 when depth is 256; truecolor by default', () => {
  assert.equal(wrap('#bc8cff', 'x', '256'), '\x1b[38;5;141mx\x1b[0m');   // 188,140,255 → cube 141
  assert.equal(wrap('#bc8cff', 'x'), '\x1b[38;2;188;140;255mx\x1b[0m');  // default unchanged
});

test('resolveColorDepth: explicit config wins; auto downgrades only Apple Terminal', () => {
  assert.equal(resolveColorDepth({ colorDepth: '256' }, {}), '256');
  assert.equal(resolveColorDepth({ colorDepth: 'truecolor' }, { TERM_PROGRAM: 'Apple_Terminal' }), 'truecolor');
  assert.equal(resolveColorDepth({ colorDepth: 'auto' }, { TERM_PROGRAM: 'Apple_Terminal' }), '256');
  assert.equal(resolveColorDepth({}, { TERM_PROGRAM: 'iTerm.app' }), 'truecolor');
  assert.equal(resolveColorDepth({}, {}), 'truecolor');
});

test('vivid at colorDepth 256 emits 256-color, not truecolor', () => {
  const [id] = colorize(vmFull, { theme: 'vivid', colorDepth: '256' }, true);
  assert.ok(id.includes('38;5;'), 'uses 256-color');
  assert.ok(!id.includes('38;2;'), 'no truecolor escapes');
});

test('powerline at colorDepth 256 uses 256-color backgrounds', () => {
  const l = colorize(vmFull, { layout: 'powerline', colorDepth: '256' }, true)[0];
  assert.ok(l.includes('48;5;') && !l.includes('48;2;'));
});

test('colorDepth is a validated config field (auto default; bad → auto)', () => {
  assert.equal(loadConfig({ userPath: '/nope.json', env: {} }).colorDepth, 'auto');
  assert.equal(loadConfig({ userPath: tmpConfig({ colorDepth: '256' }), env: {} }).colorDepth, '256');
  assert.equal(loadConfig({ userPath: tmpConfig({ colorDepth: 'neon' }), env: {} }).colorDepth, 'auto');
});

test('golden: the entry auto-downgrades to 256-color under Apple_Terminal', () => {
  const r = spawnSync(process.execPath, [ENTRY, '--color'], {
    input: fixture('full'), encoding: 'utf8',
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: tmpConfig({ theme: 'vivid' }), FORCE_COLOR: '', TERM_PROGRAM: 'Apple_Terminal' },
  });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('38;5;') && !r.stdout.includes('38;2;'), 'downgraded to 256');
});
