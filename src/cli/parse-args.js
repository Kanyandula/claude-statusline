import { parseArgs as nodeParseArgs } from 'node:util';

// Wraps node:util.parseArgs with consistent error handling + scope validation
// for every CLI subcommand. Returns { values, positionals } on success, or
// { error: 'message', code: 2 } on failure. Caller emits the error via
// stderr and returns the code.
export function parseSubcommandArgs(argv, cmdName, options = {}) {
  const fullOptions = { scope: { type: 'string', default: 'user' }, ...options };
  let parsed;
  try {
    parsed = nodeParseArgs({ args: argv, options: fullOptions, allowPositionals: true });
  } catch (e) {
    return { error: `${cmdName}: ${e.message}`, code: 2 };
  }
  if (!['user', 'project'].includes(parsed.values.scope)) {
    return { error: `${cmdName}: --scope must be 'user' or 'project'`, code: 2 };
  }
  return parsed;
}
