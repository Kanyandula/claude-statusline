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
import {
  CONFIG_KEYS, loadConfig, defaultConfigPath, isAllowedConfigPath,
} from './statusline.js';

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

// ── config (statusline.json) ─────────────────────────────────────────────────
// `config set/get/list` over the keys statusline.js declares in CONFIG_KEYS,
// riding on the loader's schema (its enum lists are the source of truth for
// valid values). Unlike init/uninstall, these touch statusline.json — which the
// renderer re-reads every render — so changes need no restart.

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dottedGet = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function dottedSet(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(o[parts[i]])) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts.at(-1)] = value;
  return obj;
}

// Coerce a string arg to the key's type → { value } or { error }. Enum values
// come from CONFIG_KEYS (the loader's own lists), so this never re-lists them.
function coerce(spec, raw) {
  if (spec.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? { value: n } : { error: 'expects a number' };
  }
  if (spec.type === 'boolean') {
    if (raw === 'true') return { value: true };
    if (raw === 'false') return { value: false };
    return { error: 'expects true or false' };
  }
  if (spec.type === 'enum') {
    return spec.values.includes(raw) ? { value: raw } : { error: `must be one of: ${spec.values.join(', ')}` };
  }
  return raw.length ? { value: raw } : { error: 'expects a non-empty string' };
}

// The file the loader reads (and we therefore write): the allowed
// CLAUDE_STATUSLINE_CONFIG override, else the default path.
function configPath(env = process.env) {
  const p = env.CLAUDE_STATUSLINE_CONFIG;
  return p && isAllowedConfigPath(p) ? p : defaultConfigPath();
}

export function configSet(key, raw, { path = configPath(), env = process.env } = {}) {
  const spec = CONFIG_KEYS[key];
  if (!spec) return { ok: false, reason: 'unknown-key', key };
  const c = coerce(spec, raw);
  if (c.error) return { ok: false, reason: 'bad-value', key, message: c.error };
  const config = readJson(path) ?? {};
  dottedSet(config, key, c.value);
  backupOnce(path);
  atomicWriteJson(path, config);
  return { ok: true, key, value: c.value, path, shadowedBy: spec.env && env[spec.env] ? spec.env : null };
}

export function configGet(key, { env = process.env } = {}) {
  if (!CONFIG_KEYS[key]) return { ok: false, reason: 'unknown-key', key };
  return { ok: true, key, value: dottedGet(loadConfig({ env }), key) };
}

export function configList({ env = process.env } = {}) {
  const eff = loadConfig({ env });
  return Object.entries(CONFIG_KEYS).map(([key, spec]) => ({
    key,
    value: dottedGet(eff, key),
    valid: spec.type === 'enum' ? spec.values.join('|') : spec.type,
    shadowedBy: spec.env && env[spec.env] ? spec.env : null,
  }));
}

function runConfig(args, io = process) {
  const sub = args[0];
  if (sub === 'set') {
    const [, key, ...rest] = args;
    if (!key || rest.length === 0) {
      io.stderr.write('config set: usage: claude-statusline config set <key> <value>\n');
      return 2;
    }
    const r = configSet(key, rest.join(' '));
    if (!r.ok) {
      if (r.reason === 'unknown-key') {
        io.stderr.write(`config set: unknown key '${key}'. Valid keys:\n  ${Object.keys(CONFIG_KEYS).join('\n  ')}\n`);
      } else {
        io.stderr.write(`config set: ${key} ${r.message}.\n`);
      }
      return 2;
    }
    io.stdout.write(`Set ${r.key} = ${r.value} in ${r.path}. Takes effect on the next render (no restart needed).\n`);
    if (r.shadowedBy) {
      io.stdout.write(`Warning: $${r.shadowedBy} is set in your environment and overrides the file (precedence: env > file). Unset it for this change to take effect.\n`);
    }
    return 0;
  }
  if (sub === 'get') {
    const key = args[1];
    if (!key) { io.stderr.write('config get: usage: claude-statusline config get <key>\n'); return 2; }
    const r = configGet(key);
    if (!r.ok) { io.stderr.write(`config get: unknown key '${key}'.\n`); return 2; }
    io.stdout.write(`${r.value}\n`);
    return 0;
  }
  if (sub === 'list' || sub === undefined) {
    const rows = configList();
    const kW = Math.max(3, ...rows.map((r) => r.key.length));
    const vW = Math.max(5, ...rows.map((r) => String(r.value).length));
    let out = `${'KEY'.padEnd(kW)}  ${'VALUE'.padEnd(vW)}  VALID\n`;
    for (const r of rows) {
      const shadow = r.shadowedBy ? `  (shadowed by $${r.shadowedBy})` : '';
      out += `${r.key.padEnd(kW)}  ${String(r.value).padEnd(vW)}  ${r.valid}${shadow}\n`;
    }
    io.stdout.write(out);
    return 0;
  }
  io.stderr.write(`config: unknown subcommand '${sub}'. Use: set <key> <value> | get <key> | list\n`);
  return 2;
}

const USAGE = `claude-statusline v2

Usage:
  cli.js init [--force]        Wire statusline.js into ~/.claude/settings.json (color forced)
  cli.js uninstall             Remove the statusLine entry
  cli.js config list           Show current config values and valid options
  cli.js config get <key>      Print the effective value of one key
  cli.js config set <key> <v>  Set a key in ~/.claude/statusline.json (no restart needed)
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
  if (cmd === 'config') return runConfig(argv.slice(1));
  process.stdout.write(USAGE);
  return cmd ? 2 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(run(process.argv.slice(2)));
}
