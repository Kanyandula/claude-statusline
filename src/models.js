// Context-window labels per model family. Used only when Claude's
// model.display_name doesn't already include a parenthetical label
// (older CLI versions, custom adapters). The split into `long` and `short`
// matches the two layouts: "(1M context)" for two-line, "(1M)" for single.
const RULES = [
  { match: /opus/i,   long: '1M context',   short: '1M' },
  { match: /sonnet/i, long: '1M context',   short: '1M' },
  { match: /haiku/i,  long: '200K context', short: '200K' },
];

// Pessimistic fallback for unknown model IDs. 200K is the common floor
// across the Claude family; if the model actually has 1M, the renderer's
// display_name parse path will surface the truth before we get here.
const DEFAULT_LONG  = '200K context';
const DEFAULT_SHORT = '200K';

/**
 * Look up a label on a RULES entry whose `match` regex matches `modelId`.
 * @param {string|null|undefined} modelId
 * @param {'long' | 'short'} key  which label to return
 * @param {string} fallback       label when no rule matches
 * @returns {string} the label, or '' for missing/empty `modelId`
 */
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
