// Command registry — single source of truth for the help text and the
// stub set. As real subcommands ship, their entries here gain an
// `implemented: true` flag so the dispatcher routes through instead of stubbing.
const COMMANDS = [
  { name: 'init',      desc: 'Wire claude-statusline into Claude Code',                    implemented: false },
  { name: 'layout',    desc: 'Switch layout: single | two-line',                            implemented: false },
  { name: 'enable',    desc: 'Turn on a field',                                              implemented: false },
  { name: 'disable',   desc: 'Turn off a field',                                             implemented: false },
  { name: 'set',       desc: 'Set a config key by dotted path',                              implemented: false },
  { name: 'get',       desc: 'Print effective config as JSON',                               implemented: false },
  { name: 'preview',   desc: 'Render the statusline once with sample data',                  implemented: false },
  { name: 'reset',     desc: 'Restore defaults (deletes config file)',                       implemented: false },
  { name: 'uninstall', desc: 'Remove statusLine from settings.json',                         implemented: false },
  { name: 'render',    desc: 'Render statusline from stdin (invoked by Claude Code each prompt)', implemented: true },
];

function buildHelp() {
  const rows = COMMANDS.map(c => `  ${c.name.padEnd(10)} ${c.desc}`).join('\n');
  return `claude-statusline <command> [options]

Commands:
${rows}
  --help, -h  Print this help

Global options:
  --scope=user|project   Which file to read/write (default: user)
  --force                Overwrite an existing statusLine entry on init
  --keep-config          Keep claude-statusline.json when uninstalling
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

  if (STUB_SUBCOMMANDS.has(cmd)) {
    process.stderr.write(`claude-statusline: '${cmd}' not implemented yet\n`);
    return 1;
  }

  process.stderr.write(`claude-statusline: unknown command '${cmd}'\n${HELP}`);
  return 64;
}
