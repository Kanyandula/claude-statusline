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
