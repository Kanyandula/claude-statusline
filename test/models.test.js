import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextWindowLabel } from '../src/models.js';

test('contextWindowLabel: opus → 1M context', () => {
  assert.equal(contextWindowLabel('claude-opus-4-7'), '1M context');
});

test('contextWindowLabel: sonnet 4.6 → 1M context', () => {
  assert.equal(contextWindowLabel('claude-sonnet-4-6'), '1M context');
});

test('contextWindowLabel: haiku → 200K context', () => {
  assert.equal(contextWindowLabel('claude-haiku-4-5-20251001'), '200K context');
});

test('contextWindowLabel: unknown → 200K context (safe default)', () => {
  assert.equal(contextWindowLabel('claude-something-new'), '200K context');
});

test('contextWindowLabel: empty/undefined → empty', () => {
  assert.equal(contextWindowLabel(undefined), '');
  assert.equal(contextWindowLabel(''), '');
});
