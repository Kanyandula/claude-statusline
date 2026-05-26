export function formatCost(usd) {
  if (typeof usd !== 'number' || Number.isNaN(usd)) return '';
  return `$${usd.toFixed(2)}`;
}
