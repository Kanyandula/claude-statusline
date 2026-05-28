import { parseArgs } from 'node:util';
import { LAYOUTS } from '../config.js';
import { configPathForScope } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath } from './config-file.js';

export function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { scope: { type: 'string', default: 'user' } },
      allowPositionals: true,
    });
  } catch (e) {
    process.stderr.write(`layout: ${e.message}\n`);
    return 2;
  }
  const { scope } = parsed.values;
  const positionals = parsed.positionals;
  if (!['user', 'project'].includes(scope)) {
    process.stderr.write(`layout: --scope must be 'user' or 'project'\n`);
    return 2;
  }
  if (positionals.length !== 1) {
    process.stderr.write(`layout: expected one argument: ${LAYOUTS.join(' | ')}\n`);
    return 2;
  }
  const value = positionals[0];
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
