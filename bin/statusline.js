#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderFromStdin } from '../src/pipeline.js';
import { loadConfig } from '../src/config.js';
import { getGitInfo } from '../src/git.js';

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});

const userPath = process.env.CLAUDE_STATUSLINE_CONFIG
  || join(homedir(), '.claude', 'claude-statusline.json');

// Cap accumulated stdin to avoid unbounded memory growth on pathological
// input. Real Claude Code payloads are well under 10 KB; 1 MB is a generous
// ceiling. Overflow is silently truncated — the resulting (likely invalid)
// JSON falls through parseInput's null path and we degrade gracefully.
const MAX_STDIN_BYTES = 1_000_000;
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  if (raw.length >= MAX_STDIN_BYTES) return;
  raw += d;
  if (raw.length > MAX_STDIN_BYTES) raw = raw.slice(0, MAX_STDIN_BYTES);
});
process.stdin.on('end', () => {
  try {
    let projectPath = null;
    try {
      const parsed = JSON.parse(raw || '{}');
      const cwd = parsed?.workspace?.current_dir || parsed?.cwd;
      if (cwd) projectPath = join(cwd, '.claude', 'claude-statusline.json');
    } catch { /* ignore — pipeline will handle */ }

    const config = loadConfig({ userPath, projectPath, env: process.env });
    process.stdout.write(renderFromStdin(raw, { config, gitFn: getGitInfo }));
  } catch (e) {
    if (process.env.CLAUDE_STATUSLINE_DEBUG) process.stderr.write(`statusline error: ${e}\n`);
  }
});
