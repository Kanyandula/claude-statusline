import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextWindowLabel, contextWindowShortLabel } from '../src/models.js';

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

test('contextWindowShortLabel: opus → 1M', () => {
  assert.equal(contextWindowShortLabel('claude-opus-4-7'), '1M');
});

test('contextWindowShortLabel: sonnet → 1M', () => {
  assert.equal(contextWindowShortLabel('claude-sonnet-4-6'), '1M');
});

test('contextWindowShortLabel: haiku → 200K', () => {
  assert.equal(contextWindowShortLabel('claude-haiku-4-5-20251001'), '200K');
});

test('contextWindowShortLabel: unknown → 200K (safe default)', () => {
  assert.equal(contextWindowShortLabel('claude-something-new'), '200K');
});

test('contextWindowShortLabel: empty/undefined → empty', () => {
  assert.equal(contextWindowShortLabel(undefined), '');
  assert.equal(contextWindowShortLabel(''), '');
});
