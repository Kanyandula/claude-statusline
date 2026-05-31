// Command registry — single source of truth for the help text and the
// stub set. As real subcommands ship, their entries here gain an
// `implemented: true` flag so the dispatcher routes through instead of stubbing.
const COMMANDS = [
  { name: 'init',      desc: 'Wire claude-statusline into Claude Code',                              flags: ['--force'],        implemented: true },
  { name: 'layout',    desc: 'Switch layout: single | two-line',                                      flags: [],                 implemented: true },
  { name: 'enable',    desc: 'Turn on a field',                                                       flags: [],                 implemented: true },
  { name: 'disable',   desc: 'Turn off a field',                                                      flags: [],                 implemented: true },
  { name: 'set',       desc: 'Set a config key by dotted path',                                       flags: [],                 implemented: true },
  { name: 'get',       desc: 'Print effective config as JSON',                                        flags: [],                 implemented: true },
  { name: 'preview',   desc: 'Render the statusline once with sample data',                          flags: ['--live'],         implemented: true },
  { name: 'reset',     desc: 'Restore defaults (deletes config file)',                                flags: [],                 implemented: true },
  { name: 'uninstall', desc: 'Remove statusLine from settings.json',                                  flags: ['--keep-config'],  implemented: true },
  { name: 'render',    desc: 'Render statusline from stdin (invoked by Claude Code each prompt)',     flags: [],                 implemented: true },
];

function buildHelp() {
  const rows = COMMANDS.map(c => {
    const flagSuffix = c.flags.length ? `   [${c.flags.join(' ')}]` : '';
    return `  ${c.name.padEnd(10)} ${c.desc}${flagSuffix}`;
  }).join('\n');
  return `claude-statusline <command> [options]

Commands:
${rows}
  --help, -h  Print this help

Global options:
  --scope=user|project   Which file to read/write (default: user; applies to
                         init, layout, enable, disable, set, reset)
  --help, -h             Print command-specific help (try: claude-statusline <cmd> --help)
`;
}

const HELP = buildHelp();
const STUB_SUBCOMMANDS = new Set(COMMANDS.filter(c => !c.implemented).map(c => c.name));

export async function runCli(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  const cmd = argv[0];

  if (cmd === 'render') {
    const { runRender } = await import('./render.js');
    await runRender();
    return 0;
  }

  if (cmd === 'init') {
    return (await import('./init.js')).run(argv.slice(1));
  }

  if (cmd === 'layout')  return (await import('./layout.js')).run(argv.slice(1));
  if (cmd === 'enable')  return (await import('./enable.js')).run(argv.slice(1), 'enable');
  if (cmd === 'disable') return (await import('./enable.js')).run(argv.slice(1), 'disable');
  if (cmd === 'set') return (await import('./set-get.js')).runSet(argv.slice(1));
  if (cmd === 'get') return (await import('./set-get.js')).runGet(argv.slice(1));
  if (cmd === 'preview')   return (await import('./preview.js')).run(argv.slice(1));
  if (cmd === 'reset')     return (await import('./reset.js')).run(argv.slice(1));
  if (cmd === 'uninstall') return (await import('./uninstall.js')).run(argv.slice(1));

  if (STUB_SUBCOMMANDS.has(cmd)) {
    process.stderr.write(`claude-statusline: '${cmd}' not implemented yet\n`);
    return 1;
  }

  process.stderr.write(`claude-statusline: unknown command '${cmd}'\n${HELP}`);
  return 64;
}
