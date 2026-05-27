import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { atomicWriteJson } from './fs-util.js';

export function readConfigFile(path) {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeConfigFile(path, obj) {
  atomicWriteJson(path, obj);
}

export function deleteConfigFile(path) {
  if (existsSync(path)) unlinkSync(path);
}

// Coerces a CLI-arg string into its natural type. Guards against weird
// JavaScript-isms: whitespace-only strings coerce to 0, 'Infinity' coerces
// to a JSON-unfriendly value — both treated as strings.
export function coerceValue(raw) {
  if (typeof raw !== 'string') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw.trim() === '') return raw;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return raw;
}

// Sets a nested key by dotted path. Intermediate non-objects are replaced
// with fresh empty objects (so `set fields.cost false` works even if `fields`
// somehow contained a primitive on disk).
export function setKeyPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}
