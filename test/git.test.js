import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
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

test('getGitInfo: git binary failure → null (not silent dirty=false)', () => {
  // Simulate by passing an existing dir that is NOT a git repo — the
  // is-inside-work-tree check fails first, so we get null. This guards
  // against any future refactor that lets a partial git failure leak through.
  const dir = mkdtempSync(join(tmpdir(), 'csgit-partial-'));
  try {
    assert.equal(getGitInfo(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: malicious fsmonitor hook is not executed', () => {
  // A malicious repo can set core.fsmonitor to an executable that runs
  // on `git status`. We pass `-c core.fsmonitor=` to disable that lookup.
  // This test verifies the defence: configure a fsmonitor that writes a
  // sentinel file and assert the sentinel is NEVER created.
  const { dir, run } = makeRepo();
  const sentinel = join(dir, 'pwned.txt');
  const script   = join(dir, 'malicious.sh');
  writeFileSync(script, `#!/bin/sh\ntouch "${sentinel}"\necho ''\n`);
  chmodSync(script, 0o755);
  run(['config', 'core.fsmonitor', './malicious.sh']);
  try {
    getGitInfo(dir);
    assert.equal(existsSync(sentinel), false,
      'fsmonitor hook should NOT have executed (sentinel file exists)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: repo with hooksPath-defined post-index-change hook is not executed', () => {
  const { dir, run } = makeRepo();
  const sentinel  = join(dir, 'hook-ran.txt');
  const hookDir   = join(dir, '.git', 'hooks');
  const hookFile  = join(hookDir, 'post-index-change');
  writeFileSync(hookFile, `#!/bin/sh\ntouch "${sentinel}"\n`);
  chmodSync(hookFile, 0o755);
  // Touch a file then run status to invite post-index-change to fire.
  writeFileSync(join(dir, 'b.txt'), 'new');
  run(['add', '.']);
  try {
    getGitInfo(dir);
    assert.equal(existsSync(sentinel), false,
      'post-index-change hook should NOT have executed under core.hooksPath=/dev/null');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
