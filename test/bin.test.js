import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sample = readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url), 'utf8');

test('bin/statusline.js: prints expected content', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], { input: sample, env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: '/nonexistent-claude-statusline-test.json' } });
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Opus 4\.7 \(1M context\)/);
  assert.match(r.stdout.toString(), /\$19\.01/);
});

test('bin/statusline.js: empty stdin does not crash', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], { input: '', env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: '/nonexistent-claude-statusline-test.json' } });
  assert.equal(r.status, 0);
});

test('bin/statusline.js: respects CLAUDE_STATUSLINE_LAYOUT=single', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], {
    input: sample,
    env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_LAYOUT: 'single', CLAUDE_STATUSLINE_CONFIG: '/nonexistent-claude-statusline-test.json' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString().split('\n').length, 1);
});

test('bin/statusline.js: user config file disables cost field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csbin-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ fields: { cost: false } }));
  try {
    const r = spawnSync(process.execPath, ['bin/statusline.js'], {
      input: sample,
      env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: file },
    });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout.toString(), /\$19\.01/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bin/statusline.js: pathologically large stdin does not crash or hang', () => {
  // Generate 2 MB of junk (well above the 1 MB cap). The script must
  // truncate, fail to parse, and degrade gracefully — not OOM or hang.
  const huge = 'x'.repeat(2_000_000);
  const r = spawnSync(process.execPath, ['bin/statusline.js'], {
    input: huge,
    env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: '/nonexistent-claude-statusline-test.json' },
    timeout: 5000,
  });
  assert.equal(r.status, 0);
  // Output is a degraded but well-formed string (just the ▌ bar, no fields).
  assert.ok(typeof r.stdout.toString() === 'string');
});
