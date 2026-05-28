import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

test('init: writes statusLine to ~/.claude/settings.json and creates config file', () => {
  const { home, settingsPath, configPath, cleanup } = tmpHome();
  try {
    const r = cli(['init'], { HOME: home });
    assert.equal(r.status, 0, `expected exit 0; stderr=${r.stderr}`);
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(s.statusLine, { type: 'command', command: 'claude-statusline render' });
    assert.equal(existsSync(configPath), true);
  } finally { cleanup(); }
});

test('init: refuses to overwrite without --force', () => {
  const { home, cleanup } = tmpHome();
  try {
    cli(['init'], { HOME: home });
    const r2 = cli(['init'], { HOME: home });
    assert.equal(r2.status, 1);
    assert.match(r2.stderr.toString(), /already configured/);
  } finally { cleanup(); }
});

test('init --force: overwrites existing statusLine', () => {
  const { home, cleanup } = tmpHome();
  try {
    cli(['init'], { HOME: home });
    const r = cli(['init', '--force'], { HOME: home });
    assert.equal(r.status, 0);
  } finally { cleanup(); }
});

test('init --scope=project: writes config file under cwd, not HOME', () => {
  const { home, cleanup } = tmpHome();
  const proj = mkdtempSync(join(tmpdir(), 'csproj-'));
  try {
    const r = cli(['init', '--scope=project'], { HOME: home }, proj);
    assert.equal(r.status, 0);
    assert.equal(existsSync(join(proj, '.claude', 'claude-statusline.json')), true);
  } finally { cleanup(); rmSync(proj, { recursive: true, force: true }); }
});

test('init: invalid --scope value exits 2', () => {
  const { home, cleanup } = tmpHome();
  try {
    const r = cli(['init', '--scope=bogus'], { HOME: home });
    assert.equal(r.status, 2);
    assert.match(r.stderr.toString(), /must be 'user' or 'project'/);
  } finally { cleanup(); }
});

test('init: preserves other settings.json keys', () => {
  const { home, settingsPath, cleanup } = tmpHome();
  try {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ permissions: { defaultMode: 'auto' }, otherKey: 'preserved' }));
    const r = cli(['init'], { HOME: home });
    assert.equal(r.status, 0);
    const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(after.otherKey, 'preserved');
    assert.deepEqual(after.permissions, { defaultMode: 'auto' });
    assert.equal(after.statusLine.command, 'claude-statusline render');
  } finally { cleanup(); }
});
