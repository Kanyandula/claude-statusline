import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderFromStdin } from '../src/pipeline.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const sample = readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url), 'utf8');

test('renderFromStdin: produces a string from valid JSON', () => {
  const out = renderFromStdin(sample, { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.match(out, /Opus 4\.7 \(1M context\)/);
});

test('renderFromStdin: empty stdin still returns a string (no throw)', () => {
  const out = renderFromStdin('', { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.equal(typeof out, 'string');
});

test('renderFromStdin: branch field enabled + gitFn provides branch → branch rendered', () => {
  const cfg = { ...DEFAULT_CONFIG };
  const out = renderFromStdin(sample, {
    config: cfg, colour: false,
    gitFn: () => ({ branch: 'feature/x', dirty: true }),
  });
  assert.match(out, /feature\/x\*/);
});

test('renderFromStdin: branch field disabled → gitFn not called', () => {
  let called = 0;
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, branch: false } };
  renderFromStdin(sample, { config: cfg, colour: false, gitFn: () => { called++; return null; } });
  assert.equal(called, 0);
});

test('renderFromStdin: gitFn returning null leaves branch unrendered but does not throw', () => {
  const out = renderFromStdin(sample, { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.doesNotMatch(out, /⎇/);
});
