import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readConfigFile, writeConfigFile, deleteConfigFile, coerceValue, setKeyPath,
} from '../../src/cli/config-file.js';

test('readConfigFile: missing file → {}', () => {
  assert.deepEqual(readConfigFile('/does/not/exist.json'), {});
});

test('readConfigFile: invalid JSON → {}', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cscf-')); const path = join(dir, 'c.json');
  writeFileSync(path, 'not json');
  try { assert.deepEqual(readConfigFile(path), {}); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readConfigFile: valid object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cscf-')); const path = join(dir, 'c.json');
  writeFileSync(path, JSON.stringify({ layout: 'single' }));
  try { assert.deepEqual(readConfigFile(path), { layout: 'single' }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeConfigFile: creates parent dir and writes JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cscf-')); const path = join(dir, 'sub', 'c.json');
  try {
    writeConfigFile(path, { layout: 'single' });
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { layout: 'single' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deleteConfigFile: removes file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cscf-')); const path = join(dir, 'c.json');
  writeFileSync(path, '{}');
  try {
    deleteConfigFile(path);
    assert.equal(existsSync(path), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deleteConfigFile: missing file is a no-op', () => {
  deleteConfigFile('/does/not/exist.json');
});

test('coerceValue: boolean / number / null / string', () => {
  assert.equal(coerceValue('true'), true);
  assert.equal(coerceValue('false'), false);
  assert.equal(coerceValue('null'), null);
  assert.equal(coerceValue('5'), 5);
  assert.equal(coerceValue('5.5'), 5.5);
  assert.equal(coerceValue('hello'), 'hello');
  assert.equal(coerceValue(true), true);
  assert.equal(coerceValue(''), '');
});

test('setKeyPath: nested assignment', () => {
  const obj = {};
  setKeyPath(obj, 'fields.cost', false);
  assert.deepEqual(obj, { fields: { cost: false } });
});

test('setKeyPath: deep nesting creates intermediate objects', () => {
  const obj = {};
  setKeyPath(obj, 'a.b.c', 1);
  assert.deepEqual(obj, { a: { b: { c: 1 } } });
});

test('setKeyPath: replaces non-object intermediate', () => {
  const obj = { fields: 'oops' };
  setKeyPath(obj, 'fields.cost', false);
  assert.deepEqual(obj, { fields: { cost: false } });
});
