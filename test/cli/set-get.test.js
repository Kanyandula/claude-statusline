import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../bin/claude-statusline.js');

function cli(args, env = {}, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, CLAUDE_STATUSLINE_CONFIG: '/nonexistent-test.json', ...env },
    cwd,
  });
}

function tmpHome() {
  const home = mkdtempSync(join(tmpdir(), 'cshome-'));
  return {
    home,
    configPath: join(home, '.claude', 'claude-statusline.json'),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

// --- set ---

test('set layout single: writes config', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'layout', 'single'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0, r.stderr.toString());
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).layout, 'single');
  } finally { cleanup(); }
});

test('set fields.cost false: boolean coerced from string', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'fields.cost', 'false'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).fields.cost, false);
  } finally { cleanup(); }
});

test('set thresholds.costWarnUsd 3: number coerced from string', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'thresholds.costWarnUsd', '3'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).thresholds.costWarnUsd, 3);
  } finally { cleanup(); }
});

test('set: unknown root key exits 2', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'bogus.x', '1'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /unknown config key 'bogus.x'/);
  } finally { cleanup(); }
});

test('set: unknown field name exits 2', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'fields.notAField', 'true'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /unknown field 'notAField'/);
  } finally { cleanup(); }
});

test('set: wrong type rejected (layout=bogus)', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'layout', 'bogus'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /layout must be one of/);
  } finally { cleanup(); }
});

test('set: fields.* requires boolean (rejects string)', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'fields.cost', 'maybe'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /fields\.cost must be true or false/);
  } finally { cleanup(); }
});

test('set: thresholds.* requires number (rejects string)', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'thresholds.costWarnUsd', 'hi'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /thresholds\.costWarnUsd must be a number/);
  } finally { cleanup(); }
});

test('set: missing args exits 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['set', 'layout'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /expected two arguments/);
  } finally { cleanup(); }
});

// --- get ---

test('get: prints effective config as JSON (defaults when no config file)', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['get'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    const cfg = JSON.parse(r.stdout.toString());
    assert.equal(cfg.layout, 'two-line');           // default
    assert.equal(cfg.fields.cost, true);            // default
    assert.equal(cfg.thresholds.costDangerUsd, 20); // default
  } finally { cleanup(); }
});

test('get: reads user config file', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    cli(['set', 'layout', 'single'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    const r = cli(['get'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    const cfg = JSON.parse(r.stdout.toString());
    assert.equal(cfg.layout, 'single');
  } finally { cleanup(); }
});

test('get layout: returns just the layout value', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['get', 'layout'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout.toString()), 'two-line');
  } finally { cleanup(); }
});

test('get fields.cost: returns just the field', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['get', 'fields.cost'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout.toString()), true);
  } finally { cleanup(); }
});

test('get: missing key path exits 1', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['get', 'fields.bogus'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath });
    assert.equal(r.status, 1);
    assert.match(r.stderr.toString(), /not found in effective config/);
  } finally { cleanup(); }
});

test('get: respects env-var overrides (CLAUDE_STATUSLINE_LAYOUT)', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['get', 'layout'], { HOME: home, CLAUDE_STATUSLINE_CONFIG: configPath, CLAUDE_STATUSLINE_LAYOUT: 'single' });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout.toString()), 'single');
  } finally { cleanup(); }
});

test('get: flag arg rejected with exit 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['get', '--scope=user'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /takes no flags/);
  } finally { cleanup(); }
});
