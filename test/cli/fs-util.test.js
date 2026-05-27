import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteJson } from '../../src/cli/fs-util.js';

test('atomicWriteJson: writes pretty JSON with trailing newline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csfs-'));
  const path = join(dir, 'out.json');
  try {
    atomicWriteJson(path, { a: 1, b: [2, 3] });
    const raw = readFileSync(path, 'utf8');
    assert.equal(raw.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(raw), { a: 1, b: [2, 3] });
    assert.match(raw, /\n  "a": 1/);  // 2-space indent
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('atomicWriteJson: creates parent directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csfs-'));
  const path = join(dir, 'a', 'b', 'c.json');
  try {
    atomicWriteJson(path, { ok: true });
    assert.equal(existsSync(path), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('atomicWriteJson: tmp file is removed (renamed away)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csfs-'));
  const path = join(dir, 'out.json');
  try {
    atomicWriteJson(path, {});
    assert.equal(existsSync(`${path}.tmp`), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
