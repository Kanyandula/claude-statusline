#!/usr/bin/env node
import { parseInput } from '../src/input.js';
import { claudeAdapter } from '../src/adapters/claude.js';
import { render } from '../src/render.js';

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  try {
    const parsed = parseInput(raw);
    const input  = claudeAdapter(parsed);
    process.stdout.write(render(input));
  } catch (e) {
    if (process.env.CLAUDE_STATUSLINE_DEBUG) process.stderr.write(`statusline error: ${e}\n`);
  }
});
