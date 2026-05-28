import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function cli(args, opts = {}) {
  return spawnSync(process.execPath, ['bin/claude-statusline.js', ...args], opts);
}

test('--help prints usage and exits 0', () => {
  const r = cli(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Commands:/);
  assert.match(r.stdout.toString(), /init\s/);
  assert.match(r.stdout.toString(), /render\s/);
});

test('-h prints usage and exits 0', () => {
  const r = cli(['-h']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Commands:/);
});

test('no args also prints usage', () => {
  const r = cli([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /claude-statusline </);
});

test('unknown command exits 64 with help', () => {
  const r = cli(['bogus']);
  assert.equal(r.status, 64);
  assert.match(r.stderr.toString(), /unknown command 'bogus'/);
  assert.match(r.stderr.toString(), /Commands:/);
});

test('stub subcommands exit 1 with not-implemented message', () => {
  for (const cmd of ['layout', 'enable', 'disable', 'set', 'get', 'preview', 'reset', 'uninstall']) {
    const r = cli([cmd]);
    assert.equal(r.status, 1, `expected status 1 for '${cmd}'`);
    assert.match(r.stderr.toString(), new RegExp(`'${cmd}' not implemented yet`));
  }
});

test('render subcommand pipes stdin through and emits output', () => {
  const sample = '{"model":{"display_name":"Opus 4.7 (1M context)","id":"claude-opus-4-7"},"cost":{"total_cost_usd":1.23,"total_duration_ms":60000}}';
  const r = cli(['render'], { input: sample, env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Opus 4\.7 \(1M context\)/);
});

test('render subcommand: empty stdin does not crash', () => {
  const r = cli(['render'], { input: '', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0);
});
