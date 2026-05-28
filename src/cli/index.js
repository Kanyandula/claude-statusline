const HELP = `\
claude-statusline <command> [options]

Commands:
  init        Wire claude-statusline into Claude Code
  layout      Switch layout: single | two-line
  enable      Turn on a field
  disable     Turn off a field
  set         Set a config key by dotted path
  get         Print effective config as JSON
  preview     Render the statusline once with sample data
  reset       Restore defaults (deletes config file)
  uninstall   Remove statusLine from settings.json
  render      Internal — invoked by Claude Code each prompt
  --help, -h  Print this help

Global options:
  --scope=user|project   Which file to read/write (default: user)
  --force                Overwrite an existing statusLine entry on init
  --keep-config          Keep claude-statusline.json when uninstalling
`;

const STUB_SUBCOMMANDS = new Set(['init', 'layout', 'enable', 'disable', 'set', 'get', 'preview', 'reset', 'uninstall']);

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
