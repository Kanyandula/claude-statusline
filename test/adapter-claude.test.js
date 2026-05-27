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
  assert.equal(out.apiDurationMs, 134721000);
  assert.equal(out.ctxPct, 15);
  assert.equal(out.linesAdded, 342);
  assert.equal(out.linesRemoved, 89);
  assert.equal(out.outputStyle, 'explanatory');
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

test('claudeAdapter: maps outputStyle from output_style.name', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.outputStyle, 'explanatory');
});

test('claudeAdapter: maps apiDurationMs from cost.total_api_duration_ms', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.apiDurationMs, 134721000);
});

test('claudeAdapter: missing output_style → null', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' } });
  assert.equal(out.outputStyle, null);
});

test('claudeAdapter: branch and dirty default to null/false', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.branch, null);
  assert.equal(out.dirty, false);
});

test('claudeAdapter: maps contextShort from model id', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.contextShort, '1M');
});

test('claudeAdapter: contextShort null when no model id', () => {
  const out = claudeAdapter({});
  assert.equal(out.contextShort, null);
});

test('claudeAdapter: display_name with parens is split (no double-label)', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7[1m]', display_name: 'Opus 4.7 (1M context)' } });
  assert.equal(out.modelName, 'Opus 4.7');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.contextShort, '1M');
});

test('claudeAdapter: display_name without parens falls back to model-id lookup', () => {
  const out = claudeAdapter({ model: { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' } });
  assert.equal(out.modelName, 'Haiku 4.5');
  assert.equal(out.contextWindow, '200K context');
  assert.equal(out.contextShort, '200K');
});

test('claudeAdapter: display_name with parens but unknown short label still parses', () => {
  const out = claudeAdapter({ model: { id: 'unknown', display_name: 'Future Model (500K context)' } });
  assert.equal(out.modelName, 'Future Model');
  assert.equal(out.contextWindow, '500K context');
  assert.equal(out.contextShort, '500K');
});

test('claudeAdapter: multi-parens display_name falls back (no mis-split)', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 'Foo (bar) (baz)' } });
  // Strict grammar rejects multi-parens; full string kept as base, label via model-id
  assert.equal(out.modelName, 'Foo (bar) (baz)');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.contextShort, '1M');
});

test('claudeAdapter: empty parens display_name falls back', () => {
  const out = claudeAdapter({ model: { id: 'claude-haiku-4-5', display_name: 'Foo ()' } });
  assert.equal(out.modelName, 'Foo ()');
  assert.equal(out.contextWindow, '200K context');
});

test('claudeAdapter: display_name with trailing junk after parens falls back', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 'Foo (1M) [v2]' } });
  assert.equal(out.modelName, 'Foo (1M) [v2]');
  assert.equal(out.contextWindow, '1M context');
});

test('claudeAdapter: display_name with paren followed by closing context label still parses', () => {
  // Sanity check that the tightening didn't break the common happy path
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7[1m]', display_name: 'Opus 4.7 (1M context)' } });
  assert.equal(out.modelName, 'Opus 4.7');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.contextShort, '1M');
});

test('claudeAdapter: display_name with leading/trailing whitespace is trimmed', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: '  Opus 4.7 (1M context)  ' } });
  assert.equal(out.modelName, 'Opus 4.7');
  assert.equal(out.contextWindow, '1M context');
});

test('claudeAdapter: display_name with extra whitespace inside parens is trimmed', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7 (  1M context  )' } });
  assert.equal(out.modelName, 'Opus 4.7');
  assert.equal(out.contextWindow, '1M context');
  assert.equal(out.contextShort, '1M');
});

test('claudeAdapter: whitespace-only display_name → treated as missing (falls back to model id)', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: '   ' } });
  assert.equal(out.modelName, null);
  assert.equal(out.contextWindow, null);
  assert.equal(out.contextShort, null);
});

test('claudeAdapter: non-string display_name is treated as missing', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 42 } });
  assert.equal(out.modelName, null);
});
