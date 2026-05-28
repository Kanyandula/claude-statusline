import { resolveUserConfigPath, resolveProjectConfigPath } from './paths.js';
import { renderFromStdin } from '../pipeline.js';
import { loadConfig } from '../config.js';
import { getGitInfo } from '../git.js';
import { computeColour } from './colour.js';

const MAX_STDIN_BYTES = 1_000_000;

/** Drains stdin, renders, writes stdout. Returns a Promise that resolves
 *  once stdout is flushed — callers that need to sequence after rendering
 *  must await it; the bin/statusline.js shim deliberately doesn't. */
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
  return new Promise(resolve => {
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
      resolve();
    });
  });
}
