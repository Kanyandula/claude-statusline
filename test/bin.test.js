import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sample = readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url), 'utf8');

test('bin/statusline.js: prints expected content', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], { input: sample, env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Opus 4\.7 \(1M context\)/);
  assert.match(r.stdout.toString(), /\$19\.01/);
});

test('bin/statusline.js: empty stdin does not crash', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], { input: '', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0);
});
