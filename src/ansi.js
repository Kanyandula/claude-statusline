// SGR codes for ANSI styling. Supported `wrap()` keys:
//   colours          red, green, yellow, blue, magenta, cyan, white
//   bright colours   brightRed, brightGreen, brightYellow, brightBlue,
//                    brightMagenta, brightCyan, brightWhite
//   modifiers        bold, dim, reset
// Unknown keys are silently ignored by wrap() (passthrough).
const CODES = {
  red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94,
  brightMagenta: 95, brightCyan: 96, brightWhite: 97,
  dim: 2, bold: 1, reset: 0
};

/**
 * Wrap text in an ANSI SGR escape sequence.
 * @param {string | string[]} style  one CODES key (e.g. 'cyan') or an array
 *                                   to combine modifiers (e.g. ['bold','cyan']).
 *                                   Arrays compose into a single sequence
 *                                   like `\x1b[1;36m…\x1b[0m` so nested
 *                                   wrap() calls (which would terminate the
 *                                   outer style early via the inner reset)
 *                                   aren't needed.
 * @param {string} text              the text to wrap
 * @returns {string} the wrapped text, or `text` unchanged if no codes resolved
 */
export function wrap(style, text) {
  const styles = Array.isArray(style) ? style : [style];
  const codes = styles.map(s => CODES[s]).filter(c => c !== undefined);
  if (codes.length === 0) return text;
  return `\x1b[${codes.join(';')}m${text}\x1b[0m`;
}

// Strip C0 (0x00–0x1F), DEL (0x7F), and C1 (0x80–0x9F) control characters
// from a string. User-supplied data (git branch names, output_style.name,
// etc.) flowing into ANSI output could otherwise carry their own ESC
// sequences — e.g. a branch named `foo\x1b]0;PWNED\x07` would set the
// terminal title. Sanitise everything that originates outside our codebase
// before it touches wrap().
export function stripControlChars(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

// Standard colour-capability detection: NO_COLOR off, FORCE_COLOR on,
// otherwise check stdout TTY. Deployment-specific overrides (e.g. "we are
// piped to from a host that renders our ANSI") belong in the caller, not
// here — keep this helper deployment-agnostic.
export function supportsColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout && process.stdout.isTTY === true;
}
