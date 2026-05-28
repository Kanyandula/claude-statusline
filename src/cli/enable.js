import { parseArgs } from 'node:util';
import { KNOWN_FIELDS } from '../config.js';
import { configPathForScope } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath } from './config-file.js';

// Single module shared by `enable` and `disable` — same shape, opposite boolean.
export function run(argv, mode /* 'enable' | 'disable' */) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { scope: { type: 'string', default: 'user' } },
      allowPositionals: true,
    });
  } catch (e) {
    process.stderr.write(`${mode}: ${e.message}\n`);
    return 2;
  }
  const { scope } = parsed.values;
  const positionals = parsed.positionals;
  if (!['user', 'project'].includes(scope)) {
    process.stderr.write(`${mode}: --scope must be 'user' or 'project'\n`);
    return 2;
  }
  if (positionals.length !== 1) {
    process.stderr.write(`${mode}: expected one field name. Known: ${KNOWN_FIELDS.join(', ')}\n`);
    return 2;
  }
  const field = positionals[0];
  if (!KNOWN_FIELDS.includes(field)) {
    process.stderr.write(`${mode}: unknown field '${field}'. Known: ${KNOWN_FIELDS.join(', ')}\n`);
    return 2;
  }
  const path = configPathForScope(scope);
  const cfg = readConfigFile(path);
  setKeyPath(cfg, `fields.${field}`, mode === 'enable');
  writeConfigFile(path, cfg);
  process.stdout.write(`${field} ${mode}d in ${path}\n`);
  return 0;
}
