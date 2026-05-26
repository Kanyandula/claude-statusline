import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCost } from '../src/format.js';

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
