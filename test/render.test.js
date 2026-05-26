import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claudeAdapter } from '../src/adapters/claude.js';
import { render } from '../src/render.js';

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
