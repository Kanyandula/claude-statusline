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

test('formatDuration: typical long session matches screenshot', () => {
  // 172977000 ms = 2882 min 57 sec
  assert.equal(formatDuration(172977000), '2882m57s');
});

test('formatDuration: short session', () => {
  assert.equal(formatDuration(65000), '1m5s');
});

test('formatDuration: under a minute', () => {
  assert.equal(formatDuration(7000), '0m7s');
});

test('formatDuration: zero', () => {
  assert.equal(formatDuration(0), '0m0s');
});

test('formatDuration: undefined → empty string', () => {
  assert.equal(formatDuration(undefined), '');
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
