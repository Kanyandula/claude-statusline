import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../../bin/claude-statusline.js');

function cli(args, env = {}, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, ...env },
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

// --- layout ---

test('layout single: writes layout=single to user config', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['layout', 'single'], { HOME: home });
    assert.equal(r.status, 0, r.stderr.toString());
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).layout, 'single');
  } finally { cleanup(); }
});

test('layout two-line: writes layout=two-line', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['layout', 'two-line'], { HOME: home });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).layout, 'two-line');
  } finally { cleanup(); }
});

test('layout: invalid value exits 2 with stderr', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['layout', 'bogus'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /invalid value 'bogus'/);
  } finally { cleanup(); }
});

test('layout: missing arg exits 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['layout'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /expected one argument/);
  } finally { cleanup(); }
});

test('layout --scope=project writes under cwd', () => {
  const { home, cleanup } = tmpHome();
  const proj = mkdtempSync(join(tmpdir(), 'csproj-'));
  try {
    const r = cli(['layout', 'single', '--scope=project'], { HOME: home }, proj);
    assert.equal(r.status, 0);
    assert.equal(existsSync(join(proj, '.claude', 'claude-statusline.json')), true);
    assert.equal(existsSync(join(home, '.claude', 'claude-statusline.json')), false);
  } finally { cleanup(); rmSync(proj, { recursive: true, force: true }); }
});

// --- enable / disable ---

test('enable apiRatio: sets fields.apiRatio=true', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['enable', 'apiRatio'], { HOME: home });
    assert.equal(r.status, 0, r.stderr.toString());
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).fields.apiRatio, true);
  } finally { cleanup(); }
});

test('disable cost: sets fields.cost=false', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['disable', 'cost'], { HOME: home });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).fields.cost, false);
  } finally { cleanup(); }
});

test('enable: unknown field exits 2 with stderr', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['enable', 'notAField'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /unknown field 'notAField'/);
  } finally { cleanup(); }
});

test('enable: missing arg exits 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['enable'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /expected one field/);
  } finally { cleanup(); }
});

test('enable --scope=project writes under cwd', () => {
  const { home, cleanup } = tmpHome();
  const proj = mkdtempSync(join(tmpdir(), 'csproj-'));
  try {
    const r = cli(['enable', 'outputStyle', '--scope=project'], { HOME: home }, proj);
    assert.equal(r.status, 0);
    const cfg = JSON.parse(readFileSync(join(proj, '.claude', 'claude-statusline.json'), 'utf8'));
    assert.equal(cfg.fields.outputStyle, true);
  } finally { cleanup(); rmSync(proj, { recursive: true, force: true }); }
});

test('enable preserves other fields when toggling one', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    cli(['enable', 'apiRatio'], { HOME: home });
    cli(['enable', 'outputStyle'], { HOME: home });
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.equal(cfg.fields.apiRatio, true);
    assert.equal(cfg.fields.outputStyle, true);
  } finally { cleanup(); }
});

test('layout then enable: both write to same config file', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    cli(['layout', 'single'], { HOME: home });
    cli(['disable', 'loc'], { HOME: home });
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.equal(cfg.layout, 'single');
    assert.equal(cfg.fields.loc, false);
  } finally { cleanup(); }
});
