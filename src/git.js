import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TIMEOUT_MS = 200;

function gitCmd(cwd, args) {
  const r = spawnSync('git', args, { cwd, timeout: TIMEOUT_MS, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

export function getGitInfo(cwd) {
  if (!cwd || !existsSync(cwd)) return null;
  const inside = gitCmd(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return null;
  const branch = gitCmd(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === null) return null;
  const status = gitCmd(cwd, ['status', '--porcelain']);
  return { branch, dirty: status !== null && status.length > 0 };
}
