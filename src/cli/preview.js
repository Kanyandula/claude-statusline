import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderFromStdin } from '../pipeline.js';
import { loadConfig } from '../config.js';
import { getGitInfo } from '../git.js';
import { resolveUserConfigPath, resolveProjectConfigPath } from './paths.js';
import { computeColour } from './colour.js';
import { parseSubcommandArgs } from './parse-args.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_FIXTURE = join(__dirname, '..', 'fixtures', 'stdin-sample.json');
const LIVE_CAPTURE = process.env.CLAUDE_STATUSLINE_LIVE_PATH || '/tmp/claude-stdin.json';

const USAGE = `claude-statusline preview [--live]

Render the statusline once with sample data and print it to stdout. Useful
for testing a config change without restarting Claude Code.

Options:
  --live                 Use real captured stdin from /tmp/claude-stdin.json
                         (or $CLAUDE_STATUSLINE_LIVE_PATH); falls back to
                         the bundled sample if missing
  --help, -h             Print this help
`;

function readSampleJson(live) {
  if (live && existsSync(LIVE_CAPTURE)) return readFileSync(LIVE_CAPTURE, 'utf8');
  if (live) process.stderr.write(
    `preview: no live capture at ${LIVE_CAPTURE} — falling back to bundled sample.\n` +
    `        (to create one, wrap your statusLine command in 'tee ${LIVE_CAPTURE}' temporarily)\n`
  );
  return readFileSync(BUNDLED_FIXTURE, 'utf8');
}

export function run(argv) {
  const parsed = parseSubcommandArgs(
    argv, 'preview', { live: { type: 'boolean', default: false } }, USAGE, { includeScope: false }
  );
  if (parsed.handled) return parsed.code;
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  if (parsed.positionals.length > 0) {
    process.stderr.write(`preview: unexpected positional argument '${parsed.positionals[0]}'\n`);
    return 2;
  }

  const raw = readSampleJson(parsed.values.live);
  const config = loadConfig({
    userPath: resolveUserConfigPath(),
    projectPath: resolveProjectConfigPath(),
    env: process.env,
  });
  process.stdout.write(renderFromStdin(raw, { config, gitFn: getGitInfo, colour: computeColour() }));
  process.stdout.write('\n');
  return 0;
}
