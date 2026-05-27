import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStatusLine, writeStatusLine, removeStatusLine } from '../../src/cli/settings.js';

function tmpSettings(initial) {
  const dir = mkdtempSync(join(tmpdir(), 'cssettings-'));
  const path = join(dir, 'settings.json');
  if (initial !== undefined) writeFileSync(path, JSON.stringify(initial));
  return { dir, path };
}

test('readStatusLine: returns null for missing file', () => {
  const { dir, path } = tmpSettings();
  try { assert.equal(readStatusLine(path), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readStatusLine: returns null when key absent', () => {
  const { dir, path } = tmpSettings({ permissions: { defaultMode: 'auto' } });
  try { assert.equal(readStatusLine(path), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readStatusLine: returns the block when present', () => {
  const block = { type: 'command', command: 'foo' };
  const { dir, path } = tmpSettings({ statusLine: block });
  try { assert.deepEqual(readStatusLine(path), block); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeStatusLine: creates settings.json + backs up if existed', () => {
  const { dir, path } = tmpSettings({ permissions: { defaultMode: 'auto' } });
  try {
    writeStatusLine(path, { type: 'command', command: 'cmd' });
    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(after.statusLine, { type: 'command', command: 'cmd' });
    assert.deepEqual(after.permissions, { defaultMode: 'auto' });
    const baks = readdirSync(dir).filter(f => f.startsWith('settings.json.bak.'));
    assert.equal(baks.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeStatusLine: writes new file when settings.json absent', () => {
  const { dir, path } = tmpSettings();
  try {
    writeStatusLine(path, { type: 'command', command: 'cmd' });
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).statusLine, { type: 'command', command: 'cmd' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('removeStatusLine: deletes key and returns true', () => {
  const { dir, path } = tmpSettings({ statusLine: { type: 'command', command: 'x' }, other: 1 });
  try {
    assert.equal(removeStatusLine(path), true);
    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(after.statusLine, undefined);
    assert.equal(after.other, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('removeStatusLine: returns false when key absent', () => {
  const { dir, path } = tmpSettings({ other: 1 });
  try { assert.equal(removeStatusLine(path), false); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readStatusLine: corrupt JSON throws a clear error (not silent null)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cssettings-bad-'));
  const path = join(dir, 'settings.json');
  writeFileSync(path, '{ not valid json');
  try {
    assert.throws(() => readStatusLine(path), /Invalid JSON/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
