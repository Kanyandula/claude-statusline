import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCost, formatDuration, formatPct, formatLoc } from '../src/format.js';

test('formatCost: typical value', () => {
  assert.equal(formatCost(19.01), '$19.01');
});

test('formatCost: rounds to 2 decimals', () => {
  assert.equal(formatCost(0.4234), '$0.42');
});

test('formatCost: zero', () => {
  assert.equal(formatCost(0), '$0.00');
});

test('formatCost: undefined → empty string', () => {
  assert.equal(formatCost(undefined), '');
});

test('formatDuration: ≥1h uses h/m format', () => {
  // 172977000 ms ≈ 2882m57s ≈ 48h2m
  assert.equal(formatDuration(172977000), '48h2m');
});

test('formatDuration: exactly 1 hour', () => {
  assert.equal(formatDuration(3600000), '1h0m');
});

test('formatDuration: 23h54m', () => {
  // 23*3600 + 54*60 = 86040 seconds
  assert.equal(formatDuration(86040000), '23h54m');
});

test('formatDuration: between 1min and 1h uses m/s format', () => {
  assert.equal(formatDuration(65000), '1m5s');
});

test('formatDuration: under a minute uses s only', () => {
  assert.equal(formatDuration(7000), '7s');
});

test('formatDuration: zero', () => {
  assert.equal(formatDuration(0), '0s');
});

test('formatDuration: undefined → empty string', () => {
  assert.equal(formatDuration(undefined), '');
});

test('formatDuration: negative → empty string (clock skew guard)', () => {
  assert.equal(formatDuration(-1000), '');
  assert.equal(formatDuration(-1), '');
});

test('formatDuration: exactly 60_000 ms boundary → 1m0s (not 60s)', () => {
  assert.equal(formatDuration(60000), '1m0s');
});

test('formatDuration: exactly 3_600_000 ms boundary → 1h0m', () => {
  assert.equal(formatDuration(3600000), '1h0m');
});

test('formatPct: integer', () => {
  assert.equal(formatPct(15), '15%');
});

test('formatPct: rounds', () => {
  assert.equal(formatPct(15.7), '16%');
});

test('formatPct: undefined → empty', () => {
  assert.equal(formatPct(undefined), '');
});

test('formatLoc: typical', () => {
  assert.equal(formatLoc(342, 89), '+342 / -89');
});

test('formatLoc: zero changes → empty', () => {
  assert.equal(formatLoc(0, 0), '');
});

test('formatLoc: undefined values treated as zero, both zero → empty', () => {
  assert.equal(formatLoc(undefined, undefined), '');
});

test('formatLoc: compact mode uses no spaces', () => {
  assert.equal(formatLoc(342, 89, { compact: true }), '+342/-89');
});

test('formatLoc: compact + zero changes → empty', () => {
  assert.equal(formatLoc(0, 0, { compact: true }), '');
});

test('formatLoc: default (non-compact) unchanged', () => {
  assert.equal(formatLoc(342, 89), '+342 / -89');
});
