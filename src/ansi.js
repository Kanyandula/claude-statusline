const CODES = {
  red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  dim: 2, bold: 1, reset: 0
};

export function wrap(colour, text) {
  const code = CODES[colour];
  if (code === undefined) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function supportsColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout && process.stdout.isTTY === true;
}
