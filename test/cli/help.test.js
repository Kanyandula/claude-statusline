import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../../bin/claude-statusline.js');

function helpFor(cmd, flag = '--help') {
  return spawnSync(process.execPath, [BIN, cmd, flag], { env: process.env });
}

const SUBCOMMANDS = ['init', 'layout', 'enable', 'disable', 'set', 'get', 'preview', 'reset', 'uninstall'];

for (const cmd of SUBCOMMANDS) {
  test(`${cmd} --help: prints usage and exits 0`, () => {
    const r = helpFor(cmd);
    assert.equal(r.status, 0, r.stderr.toString());
    assert.match(r.stdout.toString(), new RegExp(`claude-statusline ${cmd}`));
    assert.match(r.stdout.toString(), /Options:/);
    assert.match(r.stdout.toString(), /--help, -h/);
  });
  test(`${cmd} -h: short flag also prints usage and exits 0`, () => {
    const r = helpFor(cmd, '-h');
    assert.equal(r.status, 0);
    assert.match(r.stdout.toString(), /Options:/);
  });
}

// enable/disable share a module; verify both show the correct mode in the heading
test('enable --help mentions "Turn on"', () => {
  const r = helpFor('enable');
  assert.match(r.stdout.toString(), /Turn on/);
});
test('disable --help mentions "Turn off"', () => {
  const r = helpFor('disable');
  assert.match(r.stdout.toString(), /Turn off/);
});
