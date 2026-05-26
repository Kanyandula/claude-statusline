const RULES = [
  { match: /opus/i,   label: '1M context' },
  { match: /sonnet/i, label: '1M context' },
  { match: /haiku/i,  label: '200K context' },
];

export function contextWindowLabel(modelId) {
  if (!modelId) return '';
  for (const r of RULES) if (r.match.test(modelId)) return r.label;
  return '200K context';
}
