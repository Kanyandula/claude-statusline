import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claudeAdapter } from '../src/adapters/claude.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url)));

test('claudeAdapter: maps every field from the sample', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.projectName, 'myproject');
  assert.equal(out.modelName, 'Opus 4.7');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.costUsd, 19.01);
  assert.equal(out.durationMs, 172977000);
  assert.equal(out.ctxPct, 15);
  assert.equal(out.linesAdded, 342);
  assert.equal(out.linesRemoved, 89);
});

test('claudeAdapter: null input → all fields null', () => {
  const out = claudeAdapter(null);
  assert.equal(out.projectName, null);
  assert.equal(out.modelName, null);
  assert.equal(out.costUsd, null);
});

test('claudeAdapter: partial input → missing fields are null', () => {
  const out = claudeAdapter({ model: { display_name: 'Sonnet 4.6', id: 'claude-sonnet-4-6' } });
  assert.equal(out.modelName, 'Sonnet 4.6');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.costUsd, null);
});
