import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, supportsColor } from '../src/ansi.js';

test('wrap: red text', () => {
  assert.equal(wrap('red', 'foo'), '\x1b[31mfoo\x1b[0m');
});

test('wrap: dim', () => {
  assert.equal(wrap('dim', 'x'), '\x1b[2mx\x1b[0m');
});

test('wrap: unknown colour → passthrough', () => {
  assert.equal(wrap('mauve', 'x'), 'x');
});

test('supportsColor: NO_COLOR set → false', () => {
  const prev = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  try { assert.equal(supportsColor(), false); }
  finally { if (prev === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prev; }
});
