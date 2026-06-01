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

const BRANCH_HEAD = '# branch.head ';

// A single `git status --porcelain=v2 --branch` yields everything we need —
// repo membership (non-zero exit outside a work tree), the branch name
// (`# branch.head <name>`, or `(detached)`), and the dirty flag (any
// non-`#` line is a changed/untracked/unmerged entry). This replaces the
// former three sequential spawns (is-inside-work-tree, abbrev-ref, status),
// cutting the per-render git cost to one bounded call.
export function getGitInfo(cwd) {
  if (!cwd || !existsSync(cwd)) return null;
  const out = gitCmd(cwd, ['status', '--porcelain=v2', '--branch']);
  if (out === null) return null;

  let branch = null;
  let dirty = false;
  for (const line of out.split('\n')) {
    if (line.startsWith(BRANCH_HEAD)) branch = line.slice(BRANCH_HEAD.length).trim();
    else if (line && !line.startsWith('#')) dirty = true;
  }
  if (!branch) return null;
  return { branch, dirty };
}
