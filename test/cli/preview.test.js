import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../bin/claude-statusline.js');

function cli(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: '/nonexistent-test.json', ...env },
  });
}

test('preview: renders the bundled sample with default config', () => {
  const r = cli(['preview']);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.match(r.stdout.toString(), /myproject/);
  assert.match(r.stdout.toString(), /Opus 4\.7 \(1M context\)/);
  assert.match(r.stdout.toString(), /\$19\.01/);
});

test('preview: respects layout via env var', () => {
  const r = cli(['preview'], { CLAUDE_STATUSLINE_LAYOUT: 'single' });
  assert.equal(r.status, 0);
  // single layout uses (1M) short label
  assert.match(r.stdout.toString(), /Opus 4\.7 \(1M\)/);
});

test('preview: respects field toggles via env var', () => {
  const r = cli(['preview'], { CLAUDE_STATUSLINE_FIELDS: 'model,cost' });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout.toString(), /48h2m/);
});

test('preview --live: falls back to bundled sample with warning when /tmp file missing', () => {
  // Best-effort: ensure no live capture exists
  try { if (existsSync('/tmp/claude-stdin.json')) unlinkSync('/tmp/claude-stdin.json'); } catch {}
  const r = cli(['preview', '--live']);
  assert.equal(r.status, 0);
  assert.match(r.stderr.toString(), /no live capture/);
  assert.match(r.stdout.toString(), /Opus 4\.7/);
});

test('preview --live: uses /tmp/claude-stdin.json when present', () => {
  const fake = JSON.stringify({
    model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6 (1M context)' },
    workspace: { current_dir: '/tmp/livepreview' },
    cost: { total_cost_usd: 5.55, total_duration_ms: 3600000 },
    context_window: { used_percentage: 42 },
  });
  writeFileSync('/tmp/claude-stdin.json', fake);
  try {
    const r = cli(['preview', '--live']);
    assert.equal(r.status, 0);
    assert.match(r.stdout.toString(), /Sonnet 4\.6 \(1M context\)/);
    assert.match(r.stdout.toString(), /\$5\.55/);
    assert.match(r.stdout.toString(), /1h0m/);
    assert.match(r.stdout.toString(), /42% ctx/);
  } finally {
    try { unlinkSync('/tmp/claude-stdin.json'); } catch {}
  }
});

test('preview: rejects unknown flag with exit 2', () => {
  const r = cli(['preview', '--bogus']);
  assert.equal(r.status, 2);
  assert.match(r.stderr.toString(), /preview:/);
});

test('preview: rejects positional argument with exit 2', () => {
  const r = cli(['preview', 'foo']);
  assert.equal(r.status, 2);
});
