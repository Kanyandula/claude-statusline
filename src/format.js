export function formatCost(usd) {
  if (typeof usd !== 'number' || Number.isNaN(usd)) return '';
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m${totalSeconds % 60}s`;
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
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
