import { resolveUserConfigPath, resolveProjectConfigPath } from './paths.js';
import { renderFromStdin } from '../pipeline.js';
import { loadConfig } from '../config.js';
import { getGitInfo } from '../git.js';

const MAX_STDIN_BYTES = 1_000_000;

function computeColour() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.stdin && process.stdin.isTTY !== true) return true;
  return process.stdout && process.stdout.isTTY === true;
}

export function runRender() {
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
  });

  const userPath = resolveUserConfigPath();

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
        if (cwd) projectPath = resolveProjectConfigPath(cwd);
      } catch { /* projectPath stays null; pipeline parses independently */ }

      const config = loadConfig({ userPath, projectPath, env: process.env });
      const colour = computeColour();
      process.stdout.write(renderFromStdin(raw, { config, gitFn: getGitInfo, colour }));
    } catch (e) {
      if (process.env.CLAUDE_STATUSLINE_DEBUG) process.stderr.write(`statusline error: ${e}\n`);
    }
  });
}
