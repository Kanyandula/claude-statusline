// Standard colour-detection for CLI subcommands that emit ANSI:
//   NO_COLOR set        → false
//   FORCE_COLOR set     → true
//   stdin piped (not TTY) → true (statusline-host mode: host renders our output)
//   otherwise           → stdout.isTTY
export function computeColour() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.stdin && process.stdin.isTTY !== true) return true;
  return process.stdout && process.stdout.isTTY === true;
}
