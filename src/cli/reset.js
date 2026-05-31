import { existsSync } from 'node:fs';
import { configPathForScope } from './paths.js';
import { deleteConfigFile } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

const USAGE = `claude-statusline reset [--scope=user|project]

Delete the config file at the chosen scope. Defaults will apply on the
next render. Does NOT remove the statusLine entry from settings.json;
use 'uninstall' for that.

Options:
  --scope=user|project   Which config file to delete (default: user)
  --help, -h             Print this help
`;

export function run(argv) {
  const parsed = parseSubcommandArgs(argv, 'reset', {}, USAGE);
  if (parsed.handled) return parsed.code;
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  const { scope } = parsed.values;
  const path = configPathForScope(scope);
  const existed = existsSync(path);
  deleteConfigFile(path);
  process.stdout.write(
    existed
      ? `Deleted ${path}. Defaults will apply.\n`
      : `No config file at ${path}. Defaults already in effect.\n`
  );
  return 0;
}
