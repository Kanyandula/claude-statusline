import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TIMEOUT_MS = 200; // per-call cap; statusline runs on every prompt

// Defensive flags applied to every git invocation:
//   core.hooksPath=/dev/null — disables all repo-defined hooks
//   core.fsmonitor=          — disables the fsmonitor hook command
// A malicious repo on disk could otherwise execute arbitrary code the
// moment we run `git status` inside it (post-index-change, fsmonitor).
const SAFE_FLAGS = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor='];

function gitCmd(cwd, args) {
  const r = spawnSync('git', [...SAFE_FLAGS, ...args], { cwd, timeout: TIMEOUT_MS, encoding: 'utf8' });
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
  if (status === null) return null;
  return { branch, dirty: status.length > 0 };
}
