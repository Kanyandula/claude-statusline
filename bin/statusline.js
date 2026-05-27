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

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
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
