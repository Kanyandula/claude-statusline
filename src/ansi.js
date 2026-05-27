const CODES = {
  red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94,
  brightMagenta: 95, brightCyan: 96, brightWhite: 97,
  dim: 2, bold: 1, reset: 0
};

// `style` accepts either a single key (e.g. 'cyan') or an array
// (e.g. ['bold', 'cyan']) so callers can combine modifiers without
// nesting wrap() — which would break early due to inner reset codes.
export function wrap(style, text) {
  const styles = Array.isArray(style) ? style : [style];
  const codes = styles.map(s => CODES[s]).filter(c => c !== undefined);
  if (codes.length === 0) return text;
  return `\x1b[${codes.join(';')}m${text}\x1b[0m`;
}

export function supportsColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  // Statusline scripts are typically invoked with stdin piped from a host
  // (Claude Code, shell prompt, IDE statusbar) that renders ANSI to a TTY,
  // even though our own stdout is a pipe. Node sets process.stdin.isTTY to
  // `undefined` when piped and `true` when interactive — so "not true" is
  // the right check for the piped case.
  if (process.stdin && process.stdin.isTTY !== true) return true;
  // Direct invocation in a terminal — fall back to stdout TTY check.
  return process.stdout && process.stdout.isTTY === true;
}
