import { existsSync } from 'node:fs';
import { configPathForScope } from './paths.js';
import { deleteConfigFile } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

export function run(argv) {
  const parsed = parseSubcommandArgs(argv, 'reset');
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
