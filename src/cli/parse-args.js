import { parseArgs as nodeParseArgs } from 'node:util';

// Wraps node:util.parseArgs with consistent error handling + scope validation
// for every CLI subcommand. Returns one of three shapes:
//   { handled: true, code: 0 }              — --help/-h was matched; caller exits
//   { values, positionals, ... }            — successful parse
//   { error: 'message', code: 2 }           — parse or validation failure
//
// Caller checks `parsed.handled` first, then `parsed.error`, then proceeds.
//
// Params:
//   argv       — the args after the subcommand name
//   cmdName    — used for error prefixing
//   options    — additional parseArgs options (merged with the scope option)
//   usage      — optional usage string; if provided AND argv has --help/-h,
//                write to stdout and return { handled: true, code: 0 }
//   meta       — { includeScope: boolean = true }; pass false from subcommands
//                that don't accept --scope (uninstall, preview)
export function parseSubcommandArgs(argv, cmdName, options = {}, usage = null, meta = {}) {
  const { includeScope = true } = meta;

  if (usage && (argv.includes('--help') || argv.includes('-h'))) {
    process.stdout.write(usage);
    return { handled: true, code: 0 };
  }

  const fullOptions = includeScope
    ? { scope: { type: 'string', default: 'user' }, ...options }
    : { ...options };
  let parsed;
  try {
    parsed = nodeParseArgs({ args: argv, options: fullOptions, allowPositionals: true });
  } catch (e) {
    return { error: `${cmdName}: ${e.message}`, code: 2 };
  }
  if (includeScope && !['user', 'project'].includes(parsed.values.scope)) {
    return { error: `${cmdName}: --scope must be 'user' or 'project'`, code: 2 };
  }
  return parsed;
}
