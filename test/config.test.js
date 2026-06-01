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

test('loadConfig: project file overrides user file for conflicting keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const userFile = join(dir, 'u.json');
  const projFile = join(dir, 'p.json');
  writeFileSync(userFile, JSON.stringify({ layout: 'two-line', fields: { cost: false } }));
  writeFileSync(projFile, JSON.stringify({ layout: 'single', fields: { cost: true } }));
  try {
    const cfg = loadConfig({ userPath: userFile, projectPath: projFile });
    assert.equal(cfg.layout, 'single');         // project beats user
    assert.equal(cfg.fields.cost, true);         // project beats user (deep)
    assert.equal(cfg.fields.ctx, true);          // unchanged default survives
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: returned object is safe to mutate without affecting defaults', () => {
  const cfg = loadConfig({});
  cfg.layout = 'mutated';
  cfg.fields.project = false;
  assert.equal(DEFAULT_CONFIG.layout, 'two-line');
  assert.equal(DEFAULT_CONFIG.fields.project, true);
});

test('loadConfig: env CLAUDE_STATUSLINE_LAYOUT overrides layout', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_LAYOUT: 'single' } });
  assert.equal(cfg.layout, 'single');
});

test('loadConfig: env CLAUDE_STATUSLINE_LAYOUT ignores invalid value', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_LAYOUT: 'bogus' } });
  assert.equal(cfg.layout, 'two-line');
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS replaces field set', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: 'model,ctx,cost' } });
  assert.equal(cfg.fields.model, true);
  assert.equal(cfg.fields.ctx, true);
  assert.equal(cfg.fields.cost, true);
  assert.equal(cfg.fields.project, false);
  assert.equal(cfg.fields.duration, false);
  assert.equal(cfg.fields.loc, false);
  assert.equal(cfg.fields.branch, false);
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS empty value is ignored', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: '' } });
  assert.equal(cfg.fields.project, true);
});

test('loadConfig: env overrides win over user file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ layout: 'two-line' }));
  try {
    const cfg = loadConfig({ userPath: file, env: { CLAUDE_STATUSLINE_LAYOUT: 'single' } });
    assert.equal(cfg.layout, 'single');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: env CLAUDE_STATUSLINE_LAYOUT=null is ignored', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_LAYOUT: null } });
  assert.equal(cfg.layout, 'two-line');
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS whitespace-only is ignored', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: '   ' } });
  assert.equal(cfg.fields.project, true);
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS unknown field names are silently dropped', () => {
  // Documents the contract: typos / unknown field names do NOT enable anything
  // and do NOT throw. Only listed names matching real fields take effect.
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: 'model,typo,nonexistent' } });
  assert.equal(cfg.fields.model, true);
  assert.equal(cfg.fields.project, false);
  assert.equal(cfg.fields.ctx, false);
  // unknown keys do not leak onto the fields object
  assert.equal(cfg.fields.typo, undefined);
  assert.equal(cfg.fields.nonexistent, undefined);
});

test('loadConfig: rejects non-absolute userPath (path validation)', () => {
  // A relative path could resolve unexpectedly depending on cwd.
  const cfg = loadConfig({ userPath: 'relative/path.json' });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('loadConfig: rejects non-.json extension (arbitrary file read defence)', () => {
  // An attacker who can set CLAUDE_STATUSLINE_CONFIG could point it at
  // /etc/passwd, ~/.ssh/id_ed25519, ~/.aws/credentials, etc. Requiring
  // a .json extension narrows the read surface to files explicitly typed
  // as config.
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'secret.txt');
  writeFileSync(file, JSON.stringify({ layout: 'single' })); // valid JSON, wrong extension
  try {
    const cfg = loadConfig({ userPath: file });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
    assert.equal(cfg.layout, 'two-line'); // proves the .txt was NOT loaded
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadConfig: normalizes fields:null back to defaults (no blank statusline)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ fields: null }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.deepEqual(cfg.fields, DEFAULT_CONFIG.fields);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadConfig: non-boolean field value falls back to its default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  // cost as a string should not be treated as truthy config
  writeFileSync(file, JSON.stringify({ fields: { cost: 'yes', ctx: false } }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.equal(cfg.fields.cost, true);   // invalid type → default (true)
    assert.equal(cfg.fields.ctx, false);   // valid boolean preserved
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadConfig: non-number threshold falls back to its default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ thresholds: { ctxWarnPct: 'high', costWarnUsd: 3 } }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.equal(cfg.thresholds.ctxWarnPct, 70);  // invalid → default
    assert.equal(cfg.thresholds.costWarnUsd, 3);   // valid number preserved
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadConfig: unknown keys are dropped from effective config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ fields: { bogus: true }, extra: 1, thresholds: { junk: 9 } }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.equal(cfg.fields.bogus, undefined);
    assert.equal(cfg.thresholds.junk, undefined);
    assert.equal(cfg.extra, undefined);
    assert.deepEqual(Object.keys(cfg), ['layout', 'fields', 'thresholds']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadConfig: rejects projectPath with non-.json extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'config.ini');
  writeFileSync(file, JSON.stringify({ layout: 'single' }));
  try {
    const cfg = loadConfig({ projectPath: file });
    assert.equal(cfg.layout, 'two-line');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
