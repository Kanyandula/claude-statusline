import { resolveSettingsPath, resolveUserConfigPath } from './paths.js';
import { removeStatusLine } from './settings.js';
import { deleteConfigFile } from './config-file.js';
import { existsSync } from 'node:fs';
import { parseSubcommandArgs } from './parse-args.js';

const USAGE = `claude-statusline uninstall [--keep-config]

Remove the statusLine entry from ~/.claude/settings.json. Unless
--keep-config is set, also delete ~/.claude/claude-statusline.json.
Project-level configs are not touched.

Options:
  --keep-config          Preserve ~/.claude/claude-statusline.json
  --help, -h             Print this help
`;

export function run(argv) {
  const parsed = parseSubcommandArgs(
    argv, 'uninstall', { 'keep-config': { type: 'boolean', default: false } }, USAGE, { includeScope: false }
  );
  if (parsed.handled) return parsed.code;
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  if (parsed.positionals.length > 0) {
    process.stderr.write(`uninstall: unexpected positional argument '${parsed.positionals[0]}'\n`);
    return 2;
  }
  const keepConfig = parsed.values['keep-config'];

  const settingsPath = resolveSettingsPath();
  const removed = removeStatusLine(settingsPath);

  const configPath = resolveUserConfigPath();
  const configExisted = existsSync(configPath);
  if (!keepConfig) deleteConfigFile(configPath);

  const lines = [];
  if (removed) lines.push(`Removed statusLine from ${settingsPath}.`);
  else lines.push(`No statusLine entry in ${settingsPath} (already uninstalled).`);
  if (!keepConfig && configExisted) lines.push(`Deleted ${configPath}.`);
  else if (keepConfig && configExisted) lines.push(`Kept ${configPath} (--keep-config).`);
  lines.push('Restart Claude Code for the change to take effect.');
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}
