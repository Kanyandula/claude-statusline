import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubcommandArgs } from '../../src/cli/parse-args.js';

test('parseSubcommandArgs: returns parsed result for valid args', () => {
  const r = parseSubcommandArgs(['single'], 'layout');
  assert.equal(r.error, undefined);
  assert.equal(r.values.scope, 'user');
  assert.deepEqual(r.positionals, ['single']);
});

test('parseSubcommandArgs: respects custom options', () => {
  const r = parseSubcommandArgs(['--force'], 'init', { force: { type: 'boolean' } });
  assert.equal(r.values.force, true);
});

test('parseSubcommandArgs: invalid scope returns error', () => {
  const r = parseSubcommandArgs(['--scope=bogus'], 'layout');
  assert.equal(r.code, 2);
  assert.match(r.error, /layout: --scope must be/);
});

test('parseSubcommandArgs: unknown flag returns error', () => {
  const r = parseSubcommandArgs(['--badflag'], 'layout');
  assert.equal(r.code, 2);
  assert.match(r.error, /^layout: /);
});

test('parseSubcommandArgs: default scope is user', () => {
  const r = parseSubcommandArgs(['x'], 'foo');
  assert.equal(r.values.scope, 'user');
});

test('parseSubcommandArgs: scope=project accepted', () => {
  const r = parseSubcommandArgs(['x', '--scope=project'], 'foo');
  assert.equal(r.values.scope, 'project');
});
