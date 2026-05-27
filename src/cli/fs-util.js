import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Atomic JSON write: stringify with 2-space indent + trailing newline, write to
// `<path>.tmp`, then rename. Creates the parent directory if missing.
// rename(2) is atomic on POSIX, so a process killed mid-write leaves the
// target file unmodified.
export function atomicWriteJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}
