import { LAYOUTS } from '../config.js';
import { configPathForScope } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

export function run(argv) {
  const parsed = parseSubcommandArgs(argv, 'layout');
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  const { scope } = parsed.values;
  if (parsed.positionals.length !== 1) {
    process.stderr.write(`layout: expected one argument: ${LAYOUTS.join(' | ')}\n`);
    return 2;
  }
  const value = parsed.positionals[0];
  if (!LAYOUTS.includes(value)) {
    process.stderr.write(`layout: invalid value '${value}'. Must be one of: ${LAYOUTS.join(', ')}\n`);
    return 2;
  }
  const path = configPathForScope(scope);
  const cfg = readConfigFile(path);
  setKeyPath(cfg, 'layout', value);
  writeConfigFile(path, cfg);
  process.stdout.write(`layout set to '${value}' in ${path}\n`);
  return 0;
}
