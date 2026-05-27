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

export function formatPct(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '';
  return `${Math.round(n)}%`;
}

export function formatLoc(added, removed, opts = {}) {
  const a = typeof added === 'number' ? added : 0;
  const r = typeof removed === 'number' ? removed : 0;
  if (a === 0 && r === 0) return '';
  return opts.compact ? `+${a}/-${r}` : `+${a} / -${r}`;
}
