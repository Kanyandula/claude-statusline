import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { readPayload } from './statusline.js';

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
