import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SL_KEY = 'statusLine';

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function backupOnce(path) {
  if (!existsSync(path)) return;
  const ts = Math.floor(Date.now() / 1000);
  const bak = `${path}.bak.${ts}`;
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(path));
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

export function getStatusLine(settingsPath) {
  const s = readJson(settingsPath);
  return s ? s[SL_KEY] ?? null : null;
}

export function setStatusLine(settingsPath, value) {
  const s = readJson(settingsPath) ?? {};
  backupOnce(settingsPath);
  s[SL_KEY] = value;
  atomicWrite(settingsPath, s);
}

export function removeStatusLine(settingsPath) {
  const s = readJson(settingsPath);
  if (!s || !(SL_KEY in s)) return false;
  backupOnce(settingsPath);
  delete s[SL_KEY];
  atomicWrite(settingsPath, s);
  return true;
}
