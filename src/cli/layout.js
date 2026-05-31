import { LAYOUTS } from '../config.js';
import { configPathForScope } from './paths.js';
import { readConfigFile, writeConfigFile, setKeyPath } from './config-file.js';
import { parseSubcommandArgs } from './parse-args.js';

const USAGE = `claude-statusline layout <single|two-line> [--scope=user|project]

Switch between single-line and two-line layouts.

Examples:
  claude-statusline layout single
  claude-statusline layout two-line --scope=project

Options:
  --scope=user|project   Which config file to write (default: user)
  --help, -h             Print this help
`;

export function run(argv) {
  const parsed = parseSubcommandArgs(argv, 'layout', {}, USAGE);
  if (parsed.handled) return parsed.code;
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
