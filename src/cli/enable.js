import { KNOWN_FIELDS } from '../config.js';
import { configPathForScope } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

const PAST_TENSE = { enable: 'enabled', disable: 'disabled' };

// Single module shared by `enable` and `disable` — same shape, opposite boolean.
export function run(argv, mode /* 'enable' | 'disable' */) {
  const parsed = parseSubcommandArgs(argv, mode);
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return parsed.code;
  }
  const { scope } = parsed.values;
  if (parsed.positionals.length !== 1) {
    process.stderr.write(`${mode}: expected one field name. Known: ${KNOWN_FIELDS.join(', ')}\n`);
    return 2;
  }
  const field = parsed.positionals[0];
  if (!KNOWN_FIELDS.includes(field)) {
    process.stderr.write(`${mode}: unknown field '${field}'. Known: ${KNOWN_FIELDS.join(', ')}\n`);
    return 2;
  }
  const path = configPathForScope(scope);
  const cfg = readConfigFile(path);
  setKeyPath(cfg, `fields.${field}`, mode === 'enable');
  writeConfigFile(path, cfg);
  process.stdout.write(`${field} ${PAST_TENSE[mode]} in ${path}\n`);
  return 0;
}
