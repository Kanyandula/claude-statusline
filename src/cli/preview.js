import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderFromStdin } from '../pipeline.js';
import { loadConfig } from '../config.js';
import { getGitInfo } from '../git.js';
import { resolveUserConfigPath, resolveProjectConfigPath } from './paths.js';
import { computeColour } from './colour.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_FIXTURE = join(__dirname, '..', '..', 'test', 'fixtures', 'stdin-sample.json');
const LIVE_CAPTURE = process.env.CLAUDE_STATUSLINE_LIVE_PATH || '/tmp/claude-stdin.json';

function readSampleJson(live) {
  if (live && existsSync(LIVE_CAPTURE)) return readFileSync(LIVE_CAPTURE, 'utf8');
  if (live) process.stderr.write(
    `preview: no live capture at ${LIVE_CAPTURE} — falling back to bundled sample.\n` +
    `        (to create one, wrap your statusLine command in 'tee ${LIVE_CAPTURE}' temporarily)\n`
  );
  return readFileSync(BUNDLED_FIXTURE, 'utf8');
}

export function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { live: { type: 'boolean', default: false } },
      allowPositionals: false,
    });
  } catch (e) {
    process.stderr.write(`preview: ${e.message}\n`);
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
