const RULES = [
  { match: /opus/i,   long: '1M context',   short: '1M' },
  { match: /sonnet/i, long: '1M context',   short: '1M' },
  { match: /haiku/i,  long: '200K context', short: '200K' },
];

const DEFAULT_LONG  = '200K context';
const DEFAULT_SHORT = '200K';

function lookup(modelId, key, fallback) {
  if (!modelId) return '';
  for (const r of RULES) if (r.match.test(modelId)) return r[key];
  return fallback;
}

export function contextWindowLabel(modelId) {
  return lookup(modelId, 'long', DEFAULT_LONG);
}

export function contextWindowShortLabel(modelId) {
  return lookup(modelId, 'short', DEFAULT_SHORT);
}
