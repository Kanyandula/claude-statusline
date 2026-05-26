import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/input.js';

test('parseInput: valid JSON object', () => {
  const result = parseInput('{"model":{"display_name":"Opus 4.7"}}');
  assert.equal(result.model.display_name, 'Opus 4.7');
});

test('parseInput: empty string → null', () => {
  assert.equal(parseInput(''), null);
});

test('parseInput: invalid JSON → null', () => {
  assert.equal(parseInput('not json'), null);
});

test('parseInput: non-object JSON → null', () => {
  assert.equal(parseInput('"string"'), null);
  assert.equal(parseInput('42'), null);
});
