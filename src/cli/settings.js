import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { atomicWriteJson } from './fs-util.js';

const SL_KEY = 'statusLine';

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e.message}`);
  }
}

function backupOnce(path) {
  if (!existsSync(path)) return;
  const ts = Math.floor(Date.now() / 1000);
  const bak = `${path}.bak.${ts}`;
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(path));
}

export function readStatusLine(settingsPath) {
  const s = readJson(settingsPath);
  return s ? s[SL_KEY] ?? null : null;
}

export function writeStatusLine(settingsPath, value) {
  const s = readJson(settingsPath) ?? {};
  backupOnce(settingsPath);
  s[SL_KEY] = value;
  atomicWriteJson(settingsPath, s);
}

export function removeStatusLine(settingsPath) {
  const s = readJson(settingsPath);
  if (!s || !(SL_KEY in s)) return false;
  backupOnce(settingsPath);
  delete s[SL_KEY];
  atomicWriteJson(settingsPath, s);
  return true;
}
