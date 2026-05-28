import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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
    settingsPath: join(home, '.claude', 'settings.json'),
    configPath:   join(home, '.claude', 'claude-statusline.json'),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

// --- reset ---

test('reset: deletes user config file when present', () => {
  const { home, configPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ layout: 'single' }));
    const r = cli(['reset'], { HOME: home });
    assert.equal(r.status, 0, r.stderr.toString());
    assert.equal(existsSync(configPath), false);
    assert.match(r.stdout.toString(), /Deleted/);
  } finally { cleanup(); }
});

test('reset: idempotent — missing file exits 0', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['reset'], { HOME: home });
    assert.equal(r.status, 0);
    assert.match(r.stdout.toString(), /No config file|already in effect/);
  } finally { cleanup(); }
});

test('reset --scope=project: deletes project config not user config', () => {
  const { home, configPath, cleanup } = tmpHome();
  const proj = mkdtempSync(join(tmpdir(), 'csproj-'));
  const projConfig = join(proj, '.claude', 'claude-statusline.json');
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ layout: 'single' }));
    writeFileSync(projConfig, JSON.stringify({ layout: 'two-line' }));
    const r = cli(['reset', '--scope=project'], { HOME: home }, proj);
    assert.equal(r.status, 0);
    assert.equal(existsSync(projConfig), false);
    assert.equal(existsSync(configPath), true);  // user config untouched
  } finally { cleanup(); rmSync(proj, { recursive: true, force: true }); }
});

test('reset: does NOT touch settings.json', () => {
  const { home, settingsPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'x' }, other: 1 }));
    cli(['reset'], { HOME: home });
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(s.statusLine, { type: 'command', command: 'x' });
    assert.equal(s.other, 1);
  } finally { cleanup(); }
});

// --- uninstall ---

test('uninstall: removes statusLine and deletes user config', () => {
  const { home, settingsPath, configPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'x' }, other: 1 }));
    writeFileSync(configPath, JSON.stringify({ layout: 'single' }));
    const r = cli(['uninstall'], { HOME: home });
    assert.equal(r.status, 0, r.stderr.toString());
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(s.statusLine, undefined);
    assert.equal(s.other, 1);                     // other settings preserved
    assert.equal(existsSync(configPath), false);  // user config deleted
  } finally { cleanup(); }
});

test('uninstall --keep-config: removes statusLine but preserves config', () => {
  const { home, settingsPath, configPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'x' } }));
    writeFileSync(configPath, JSON.stringify({ layout: 'single' }));
    const r = cli(['uninstall', '--keep-config'], { HOME: home });
    assert.equal(r.status, 0);
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(s.statusLine, undefined);
    assert.equal(existsSync(configPath), true);
    assert.match(r.stdout.toString(), /Kept/);
  } finally { cleanup(); }
});

test('uninstall: idempotent — no statusLine present', () => {
  const { home, settingsPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ other: 1 }));
    const r = cli(['uninstall'], { HOME: home });
    assert.equal(r.status, 0);
    assert.match(r.stdout.toString(), /already uninstalled/);
  } finally { cleanup(); }
});

test('uninstall: works when settings.json does not exist', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['uninstall'], { HOME: home });
    assert.equal(r.status, 0);
  } finally { cleanup(); }
});

test('uninstall: unknown flag exits 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['uninstall', '--bogus'], { HOME: home });
    assert.equal(r.status, 2);
  } finally { cleanup(); }
});

test('init then uninstall: full round-trip leaves no traces', () => {
  const { home, settingsPath, configPath, cleanup } = tmpHome();
  try {
    cli(['init'], { HOME: home });
    assert.equal(existsSync(settingsPath), true);
    assert.equal(existsSync(configPath), true);
    cli(['uninstall'], { HOME: home });
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(s.statusLine, undefined);
    assert.equal(existsSync(configPath), false);
  } finally { cleanup(); }
});
