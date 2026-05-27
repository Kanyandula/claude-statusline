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

test('supportsColor: piped stdin (not a TTY) → true, assuming host renders ANSI', () => {
  // Statusline mode: Claude Code (or any other host) pipes JSON to our stdin.
  // In that case, even if stdout isn't a TTY, the host renders our output to
  // a TTY of its own, so colour should be on by default.
  const prevNo = process.env.NO_COLOR;
  const prevForce = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  // process.stdin.isTTY is undefined when piped, so we simulate by stubbing.
  const orig = process.stdin.isTTY;
  // Node's actual value for piped stdin is `undefined` — test that exact case.
  Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
  try {
    assert.equal(supportsColor(), true);
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: orig, configurable: true });
    if (prevNo !== undefined) process.env.NO_COLOR = prevNo;
    if (prevForce !== undefined) process.env.FORCE_COLOR = prevForce;
  }
});
