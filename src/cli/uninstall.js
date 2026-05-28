import { parseArgs } from 'node:util';
import { resolveSettingsPath, resolveUserConfigPath } from './paths.js';
import { removeStatusLine } from './settings.js';
import { deleteConfigFile } from './config-file.js';
import { existsSync } from 'node:fs';

export function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { 'keep-config': { type: 'boolean', default: false } },
      allowPositionals: false,
    });
  } catch (e) {
    process.stderr.write(`uninstall: ${e.message}\n`);
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
