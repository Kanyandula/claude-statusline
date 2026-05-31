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

// --- --help / -h short-circuit ---

function captureStdout(fn) {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(c.toString()); return true; };
  try { return { result: fn(), out: chunks.join('') }; }
  finally { process.stdout.write = orig; }
}

test('parseSubcommandArgs: --help with usage prints + returns handled', () => {
  const { result, out } = captureStdout(() =>
    parseSubcommandArgs(['--help'], 'init', {}, 'USAGE TEXT\n')
  );
  assert.equal(result.handled, true);
  assert.equal(result.code, 0);
  assert.equal(out, 'USAGE TEXT\n');
});

test('parseSubcommandArgs: -h short flag also handled', () => {
  const { result, out } = captureStdout(() =>
    parseSubcommandArgs(['-h'], 'cmd', {}, 'X\n')
  );
  assert.equal(result.handled, true);
  assert.equal(out, 'X\n');
});

test('parseSubcommandArgs: --help in middle of argv is still handled', () => {
  const { result } = captureStdout(() =>
    parseSubcommandArgs(['foo', '--help'], 'cmd', {}, 'X\n')
  );
  assert.equal(result.handled, true);
});

test('parseSubcommandArgs: no usage param → --help is treated as unknown flag (existing behaviour)', () => {
  const r = parseSubcommandArgs(['--help'], 'cmd');
  assert.equal(r.handled, undefined);
  // parseArgs will reject --help as unknown option
  assert.equal(r.code, 2);
});

// --- includeScope: false ---

test('parseSubcommandArgs: includeScope=false omits scope option', () => {
  const r = parseSubcommandArgs([], 'uninstall', {}, null, { includeScope: false });
  assert.equal(r.error, undefined);
  assert.equal(r.values.scope, undefined);
});

test('parseSubcommandArgs: includeScope=false → --scope is unknown', () => {
  const r = parseSubcommandArgs(['--scope=user'], 'uninstall', {}, null, { includeScope: false });
  assert.equal(r.code, 2);
  assert.match(r.error, /^uninstall:/);
});

test('parseSubcommandArgs: includeScope=false + --help still works', () => {
  const { result } = captureStdout(() =>
    parseSubcommandArgs(['--help'], 'cmd', {}, 'USAGE\n', { includeScope: false })
  );
  assert.equal(result.handled, true);
});
