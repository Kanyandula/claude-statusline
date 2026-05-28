import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { resolveSettingsPath, configPathForScope } from './paths.js';
import { readStatusLine, writeStatusLine } from './settings.js';
import { writeConfigFile } from './config-file.js';

const SL_BLOCK = { type: 'command', command: 'claude-statusline render' };

export function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        scope: { type: 'string', default: 'user' },
        force: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
  } catch (e) {
    process.stderr.write(`init: ${e.message}\n`);
    return 2;
  }
  const { scope, force } = parsed.values;
  if (!['user', 'project'].includes(scope)) {
    process.stderr.write(`init: --scope must be 'user' or 'project'\n`);
    return 2;
  }

  const settingsPath = resolveSettingsPath();
  const existing = readStatusLine(settingsPath);
  if (existing && !force) {
    process.stderr.write(`init: statusLine already configured in ${settingsPath}. Pass --force to overwrite.\n`);
    return 1;
  }
  writeStatusLine(settingsPath, SL_BLOCK);

  const configPath = configPathForScope(scope);
  if (!existsSync(configPath)) writeConfigFile(configPath, {});

  process.stdout.write(
    `Wired claude-statusline into ${settingsPath}.\n` +
    `Config file: ${configPath} (defaults apply).\n` +
    `Restart Claude Code for the change to take effect.\n`
  );
  return 0;
}
