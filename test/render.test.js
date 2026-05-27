import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claudeAdapter } from '../src/adapters/claude.js';
import { render } from '../src/render.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url)));

test('render: two-line layout (no colour) matches expected text', () => {
  const out = render(claudeAdapter(sample), { colour: false });
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /myproject/);
  assert.match(lines[0], /Opus 4\.7 \(1M context\)/);
  assert.match(lines[1], /15% ctx/);
  assert.match(lines[1], /2882m57s/);
  assert.match(lines[1], /\$19\.01/);
  assert.match(lines[1], /\+342 \/ -89/);
});

test('render: empty input → degraded but does not throw', () => {
  const out = render(claudeAdapter(null), { colour: false });
  assert.equal(typeof out, 'string');
});

test('render: ctx ≥90 with colour wraps in red ANSI code', () => {
  const out = render({ ...claudeAdapter(sample), ctxPct: 95 }, { colour: true });
  assert.match(out, /\x1b\[31m.*95%/);
});

test('render: disabling cost field via config hides it', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, cost: false } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.doesNotMatch(out, /\$19\.01/);
});

test('render: ctx threshold change to 10 makes 15% red', () => {
  const cfg = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds, ctxDangerPct: 10 } };
  const out = render(claudeAdapter(sample), { colour: true, config: cfg });
  assert.match(out, /\x1b\[31m.*15%/);
});

test('render: cost threshold change makes $19.01 red when costDangerUsd=10', () => {
  const cfg = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds, costDangerUsd: 10 } };
  const out = render(claudeAdapter(sample), { colour: true, config: cfg });
  assert.match(out, /\x1b\[31m\$19\.01/);
});

test('render: apiRatio field enabled prints API %', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, apiRatio: true } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  // 134721000 / 172977000 ≈ 78%
  assert.match(out, /78%/);
});

test('render: outputStyle field enabled prints style name', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, outputStyle: true } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /explanatory/);
});

test('render: branch field rendered when input.branch present', () => {
  const cfg = { ...DEFAULT_CONFIG };
  const input = { ...claudeAdapter(sample), branch: 'main', dirty: false };
  const out = render(input, { colour: false, config: cfg });
  assert.match(out, /main/);
});

test('render: dirty branch gets * suffix', () => {
  const input = { ...claudeAdapter(sample), branch: 'main', dirty: true };
  const out = render(input, { colour: false, config: DEFAULT_CONFIG });
  assert.match(out, /main\*/);
});

test('render: disabling branch field via config hides ⎇ marker', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, branch: false } };
  const input = { ...claudeAdapter(sample), branch: 'main', dirty: true };
  const out = render(input, { colour: false, config: cfg });
  assert.doesNotMatch(out, /⎇/);
});

test('render: apiRatio with durationMs=0 produces no stray ANSI', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, apiRatio: true } };
  const input = { ...claudeAdapter(sample), durationMs: 0 };
  const out = render(input, { colour: true, config: cfg });
  assert.doesNotMatch(out, /🌐/);
  // No empty-wrap ANSI artifact:
  assert.doesNotMatch(out, /\x1b\[2m\x1b\[0m/);
});

test('render: single-line layout produces exactly one line', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.equal(out.split('\n').length, 1);
});

test('render: single-line uses short context window label', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /Opus 4\.7 \(1M\)/);
  assert.doesNotMatch(out, /Opus 4\.7 \(1M context\)/);
});

test('render: single-line uses compact LOC format', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /\+342\/-89/);
});

test('render: two-line layout still produces two lines (regression)', () => {
  const out = render(claudeAdapter(sample), { colour: false });
  assert.equal(out.split('\n').length, 2);
});
