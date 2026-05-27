import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getStatusLine, setStatusLine, removeStatusLine } from '../../src/cli/settings.js';

function tmpSettings(initial) {
  const dir = mkdtempSync(join(tmpdir(), 'cssettings-'));
  const path = join(dir, 'settings.json');
  if (initial !== undefined) writeFileSync(path, JSON.stringify(initial));
  return { dir, path };
}

test('getStatusLine: returns null for missing file', () => {
  const { dir, path } = tmpSettings();
  try { assert.equal(getStatusLine(path), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getStatusLine: returns null when key absent', () => {
  const { dir, path } = tmpSettings({ permissions: { defaultMode: 'auto' } });
  try { assert.equal(getStatusLine(path), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getStatusLine: returns the block when present', () => {
  const block = { type: 'command', command: 'foo' };
  const { dir, path } = tmpSettings({ statusLine: block });
  try { assert.deepEqual(getStatusLine(path), block); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setStatusLine: creates settings.json + backs up if existed', () => {
  const { dir, path } = tmpSettings({ permissions: { defaultMode: 'auto' } });
  try {
    setStatusLine(path, { type: 'command', command: 'cmd' });
    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(after.statusLine, { type: 'command', command: 'cmd' });
    assert.deepEqual(after.permissions, { defaultMode: 'auto' });
    const baks = readdirSync(dir).filter(f => f.startsWith('settings.json.bak.'));
    assert.equal(baks.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setStatusLine: writes new file when settings.json absent', () => {
  const { dir, path } = tmpSettings();
  try {
    setStatusLine(path, { type: 'command', command: 'cmd' });
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
