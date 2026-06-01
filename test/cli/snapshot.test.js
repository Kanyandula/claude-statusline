import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../../src/render.js';
import { claudeAdapter } from '../../src/adapters/claude.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

const sample = JSON.parse(readFileSync(new URL('../../src/fixtures/stdin-sample.json', import.meta.url)));
const baseInput = claudeAdapter(sample);

test('snapshot: default two-line layout (no colour) matches exact string', () => {
  const out = render(baseInput, { colour: false });
  const expected =
    '▌  myproject  │  Opus 4.7 (1M context)\n' +
    '  ● 15% ctx  │  ⏱ 48h2m  │  $19.01  │  +342 / -89';
  assert.equal(out, expected);
});

test('snapshot: single-line layout (no colour) matches exact string', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(baseInput, { colour: false, config: cfg });
  const expected = '▌  myproject  │  Opus 4.7 (1M)  │  ● 15% ctx  │  ⏱ 48h2m  │  $19.01  │  +342/-89';
  assert.equal(out, expected);
});

test('snapshot: two-line layout (colour) emits correct ANSI codes per field', () => {
  const out = render(baseInput, { colour: true });
  // Bar + separators dim
  assert.match(out, /\x1b\[2m▌\x1b\[0m/);
  assert.match(out, /\x1b\[2m│\x1b\[0m/);
  // Project bold + brightMagenta
  assert.match(out, /\x1b\[1;95mmyproject\x1b\[0m/);
  // Model bold + brightBlue
  assert.match(out, /\x1b\[1;94mOpus 4\.7 \(1M context\)\x1b\[0m/);
  // ctx 15% → green
  assert.match(out, /\x1b\[32m● 15% ctx\x1b\[0m/);
  // duration → yellow
  assert.match(out, /\x1b\[33m⏱ 48h2m\x1b\[0m/);
  // cost $19.01 ≥ $5 warn but < $20 danger → yellow
  assert.match(out, /\x1b\[33m\$19\.01\x1b\[0m/);
  // LOC → yellow
  assert.match(out, /\x1b\[33m\+342 \/ -89\x1b\[0m/);
});

test('snapshot: single-line layout (colour) — compact model + compact LOC', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(baseInput, { colour: true, config: cfg });
  // Compact model: "(1M)" not "(1M context)"
  assert.match(out, /\x1b\[1;94mOpus 4\.7 \(1M\)\x1b\[0m/);
  // Compact LOC: no spaces
  assert.match(out, /\x1b\[33m\+342\/-89\x1b\[0m/);
  // Same threshold colour on cost
  assert.match(out, /\x1b\[33m\$19\.01\x1b\[0m/);
  // Single line — no \n in output
  assert.equal(out.includes('\n'), false);
});

test('snapshot: ctx 75% renders yellow (warn band)', () => {
  const out = render({ ...baseInput, ctxPct: 75 }, { colour: true });
  assert.match(out, /\x1b\[33m● 75% ctx\x1b\[0m/);
});

test('snapshot: ctx 95% renders red (danger band)', () => {
  const out = render({ ...baseInput, ctxPct: 95 }, { colour: true });
  assert.match(out, /\x1b\[31m● 95% ctx\x1b\[0m/);
});

test('snapshot: cost $30 renders red (danger band)', () => {
  const out = render({ ...baseInput, costUsd: 30 }, { colour: true });
  assert.match(out, /\x1b\[31m\$30\.00\x1b\[0m/);
});

test('snapshot: dirty branch renders ⎇ main with bright-red *', () => {
  const input = { ...baseInput, branch: 'main', dirty: true };
  const out = render(input, { colour: true });
  // Branch is bold+brightCyan; dirty asterisk separately brightRed
  assert.match(out, /\x1b\[1;96m⎇ main\x1b\[0m\x1b\[91m\*\x1b\[0m/);
});

test('snapshot: all data fields disabled → just ▌', () => {
  const cfg = {
    ...DEFAULT_CONFIG,
    fields: {
      project: false, branch: false, model: false,
      ctx: false, duration: false, cost: false, loc: false,
      apiRatio: false, outputStyle: false,
    },
  };
  const out = render(baseInput, { colour: false, config: cfg });
  assert.equal(out, '▌');
});
