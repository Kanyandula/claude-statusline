import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeColour } from '../../src/cli/colour.js';

test('computeColour: NO_COLOR set → false (highest priority)', () => {
  const prevNo = process.env.NO_COLOR;
  const prevForce = process.env.FORCE_COLOR;
  process.env.NO_COLOR = '1';
  process.env.FORCE_COLOR = '1';
  try { assert.equal(computeColour(), false); }
  finally {
    if (prevNo === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prevNo;
    if (prevForce === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = prevForce;
  }
});

test('computeColour: FORCE_COLOR set → true', () => {
  const prevNo = process.env.NO_COLOR;
  const prevForce = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  process.env.FORCE_COLOR = '1';
  try { assert.equal(computeColour(), true); }
  finally {
    if (prevNo !== undefined) process.env.NO_COLOR = prevNo;
    if (prevForce === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = prevForce;
  }
});
