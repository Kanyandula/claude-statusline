#!/usr/bin/env node
// claude-statusline v2 — cli.js. The only two commands: `init` wires
// statusline.js into ~/.claude/settings.json (forcing color, since Claude Code
// pipes our stdout but renders ANSI); `uninstall` removes it. Both preserve any
// other settings keys, back the file up once, and write atomically.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  readFileSync, writeFileSync, renameSync, mkdirSync, existsSync,
} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STATUSLINE_PATH = join(HERE, 'statusline.js');
export const settingsPath = () => join(homedir(), '.claude', 'settings.json');

// The statusLine entry Claude Code runs. --color overrides TTY detection so the
// threshold colors render even though our stdout is piped.
export function statusLineBlock(scriptPath = STATUSLINE_PATH) {
  return { type: 'command', command: `node ${JSON.stringify(scriptPath)} --color` };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e.message}`);
  }
}

// Atomic JSON write (tmp + rename); rename(2) is atomic on POSIX, so a crash
// mid-write leaves the original untouched.
function atomicWriteJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

// One-time backup before the first mutation so a botched merge is recoverable.
function backupOnce(path) {
  if (!existsSync(path)) return;
  const bak = `${path}.bak.${Math.floor(Date.now() / 1000)}`;
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(path));
}

export function init({ path = settingsPath(), force = false, scriptPath = STATUSLINE_PATH } = {}) {
  const s = readJson(path) ?? {};
  if (s.statusLine && !force) return { ok: false, reason: 'exists', path };
  backupOnce(path);
  s.statusLine = statusLineBlock(scriptPath);
  atomicWriteJson(path, s);
  return { ok: true, path };
}

export function uninstall({ path = settingsPath() } = {}) {
  const s = readJson(path);
  if (!s || !('statusLine' in s)) return { ok: true, removed: false, path };
  backupOnce(path);
  delete s.statusLine;
  atomicWriteJson(path, s);
  return { ok: true, removed: true, path };
}

const USAGE = `claude-statusline v2

Usage:
  cli.js init [--force]   Wire statusline.js into ~/.claude/settings.json (color forced)
  cli.js uninstall        Remove the statusLine entry
`;

export function run(argv) {
  const cmd = argv[0];
  if (cmd === 'init') {
    const r = init({ force: argv.includes('--force') });
    if (!r.ok) {
      process.stderr.write(`init: statusLine already configured in ${r.path}. Pass --force to overwrite.\n`);
      return 1;
    }
    process.stdout.write(`Wired claude-statusline into ${r.path} (color forced on).\nRestart Claude Code to apply.\n`);
    return 0;
  }
  if (cmd === 'uninstall') {
    const r = uninstall();
    process.stdout.write(
      (r.removed ? `Removed statusLine from ${r.path}.` : `No statusLine entry in ${r.path} (already uninstalled).`) +
      `\nRestart Claude Code to apply.\n`,
    );
    return 0;
  }
  process.stdout.write(USAGE);
  return cmd ? 2 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(run(process.argv.slice(2)));
}
