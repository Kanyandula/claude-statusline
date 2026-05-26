export function formatCost(usd) {
  if (typeof usd !== 'number' || Number.isNaN(usd)) return '';
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds}s`;
}
