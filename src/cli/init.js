import { existsSync } from 'node:fs';
import { resolveSettingsPath, configPathForScope } from './paths.js';
import { readStatusLine, writeStatusLine } from './settings.js';
import { writeConfigFile } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

const USAGE = `claude-statusline init [--scope=user|project] [--force]

Wire claude-statusline into Claude Code by adding a statusLine entry to
~/.claude/settings.json and creating an empty config file. Defaults apply
until you customise.

Options:
  --scope=user|project   Where to write the config file (default: user)
  --force                Overwrite an existing statusLine entry
  --help, -h             Print this help
`;

const SL_BLOCK = { type: 'command', command: 'claude-statusline render' };

export function run(argv) {
  const parsed = parseSubcommandArgs(argv, 'init', { force: { type: 'boolean', default: false } }, USAGE);
  if (parsed.handled) return parsed.code;
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  const { scope, force } = parsed.values;

  const settingsPath = resolveSettingsPath();
  // Any truthy statusLine counts as configured, regardless of shape.
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
