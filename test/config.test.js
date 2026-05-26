import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG, loadConfig } from '../src/config.js';

test('DEFAULT_CONFIG: layout is two-line and core fields enabled', () => {
  assert.equal(DEFAULT_CONFIG.layout, 'two-line');
  assert.equal(DEFAULT_CONFIG.fields.project, true);
  assert.equal(DEFAULT_CONFIG.fields.ctx, true);
  assert.equal(DEFAULT_CONFIG.fields.cost, true);
  assert.equal(DEFAULT_CONFIG.fields.apiRatio, false);
  assert.equal(DEFAULT_CONFIG.thresholds.ctxWarnPct, 70);
  assert.equal(DEFAULT_CONFIG.thresholds.costDangerUsd, 20);
});

test('loadConfig: no inputs returns defaults', () => {
  const cfg = loadConfig({});
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('loadConfig: missing user file does not throw', () => {
  const cfg = loadConfig({ userPath: '/does/not/exist.json' });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('loadConfig: user file deep-merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ layout: 'single', fields: { ctx: false } }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.equal(cfg.layout, 'single');
    assert.equal(cfg.fields.ctx, false);
    assert.equal(cfg.fields.cost, true);       // unchanged from defaults
    assert.equal(cfg.thresholds.ctxWarnPct, 70); // unchanged from defaults
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: invalid JSON in user file falls back to defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, 'not json');
  try {
    const cfg = loadConfig({ userPath: file });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
