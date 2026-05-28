import { LAYOUTS, KNOWN_FIELDS, KNOWN_THRESHOLDS, loadConfig } from '../config.js';
import { configPathForScope, resolveUserConfigPath, resolveProjectConfigPath } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath, coerceValue } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

/** Validates a dotted path against the schema. Returns null if OK, or an error message. */
function validateKeyPath(dotted, value) {
  if (dotted === 'layout') {
    if (typeof value !== 'string' || !LAYOUTS.includes(value)) {
      return `layout must be one of ${LAYOUTS.join(', ')}`;
    }
    return null;
  }
  const parts = dotted.split('.');
  if (parts.length === 2 && parts[0] === 'fields') {
    if (!KNOWN_FIELDS.includes(parts[1])) return `unknown field '${parts[1]}'. Known: ${KNOWN_FIELDS.join(', ')}`;
    if (typeof value !== 'boolean') return `fields.${parts[1]} must be true or false`;
    return null;
  }
  if (parts.length === 2 && parts[0] === 'thresholds') {
    if (!KNOWN_THRESHOLDS.includes(parts[1])) return `unknown threshold '${parts[1]}'. Known: ${KNOWN_THRESHOLDS.join(', ')}`;
    if (typeof value !== 'number') return `thresholds.${parts[1]} must be a number`;
    return null;
  }
  return `unknown config key '${dotted}'. Allowed roots: layout, fields.*, thresholds.*`;
}

export function runSet(argv) {
  const parsed = parseSubcommandArgs(argv, 'set');
  if (parsed.error) { process.stderr.write(`${parsed.error}\n`); return parsed.code; }
  const { scope } = parsed.values;
  if (parsed.positionals.length !== 2) {
    process.stderr.write(`set: expected two arguments: <key.path> <value>\n`);
    return 2;
  }
  const [dotted, rawValue] = parsed.positionals;
  const value = coerceValue(rawValue);
  const err = validateKeyPath(dotted, value);
  if (err) { process.stderr.write(`set: ${err}\n`); return 2; }

  const path = configPathForScope(scope);
  const cfg = readConfigFile(path);
  setKeyPath(cfg, dotted, value);
  writeConfigFile(path, cfg);
  process.stdout.write(`${dotted} = ${JSON.stringify(value)} in ${path}\n`);
  return 0;
}

/** Looks up a value by dotted path. Returns undefined if any intermediate is missing. */
function getKeyPath(obj, dotted) {
  let cur = obj;
  for (const k of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    // Block prototype-chain traversal: `get __proto__.toString` would otherwise
    // reach Object.prototype and surface built-ins as "config values".
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : undefined;
  }
  return cur;
}

export function runGet(argv) {
  const parsed = parseSubcommandArgs(argv, 'get');
  if (parsed.error) { process.stderr.write(`${parsed.error}\n`); return parsed.code; }
  // get doesn't accept --scope — the merged-config view is what we always print.
  if (argv.some(a => a === '--scope' || a.startsWith('--scope='))) {
    process.stderr.write(`get: takes no flags; expected optional <key.path>\n`);
    return 2;
  }
  if (parsed.positionals.length > 1) {
    process.stderr.write(`get: expected at most one <key.path>\n`);
    return 2;
  }
  const positional = parsed.positionals[0];

  const cfg = loadConfig({
    userPath: resolveUserConfigPath(),
    projectPath: resolveProjectConfigPath(),
    env: process.env,
  });

  if (positional !== undefined) {
    const v = getKeyPath(cfg, positional);
    if (v === undefined) {
      process.stderr.write(`get: '${positional}' not found in effective config\n`);
      return 1;
    }
    process.stdout.write(JSON.stringify(v, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
  return 0;
}
