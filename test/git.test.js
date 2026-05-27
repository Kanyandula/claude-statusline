import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { getGitInfo } from '../src/git.js';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'csgit-'));
  const run = (args) => spawnSync('git', args, { cwd: dir });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@test']);
  run(['config', 'user.name', 'test']);
  writeFileSync(join(dir, 'a.txt'), 'hi');
  run(['add', '.']);
  run(['commit', '-q', '-m', 'init']);
  return { dir, run };
}

test('getGitInfo: clean repo returns branch=main, dirty=false', () => {
  const { dir } = makeRepo();
  try {
    const info = getGitInfo(dir);
    assert.equal(info.branch, 'main');
    assert.equal(info.dirty, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: dirty working tree returns dirty=true', () => {
  const { dir } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'changed');
    const info = getGitInfo(dir);
    assert.equal(info.dirty, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: non-git directory returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csnogit-'));
  try {
    assert.equal(getGitInfo(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: missing cwd returns null', () => {
  assert.equal(getGitInfo(null), null);
  assert.equal(getGitInfo('/does/not/exist'), null);
});
