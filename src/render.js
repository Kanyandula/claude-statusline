import { formatCost, formatDuration, formatPct, formatLoc } from './format.js';
import { wrap, supportsColor } from './ansi.js';

function ctxColour(pct) {
  if (pct == null) return 'dim';
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'yellow';
  return 'green';
}

function costColour(usd) {
  if (usd == null) return null;
  if (usd >= 20) return 'red';
  if (usd >= 5)  return 'yellow';
  return null;
}

export function render(input, opts = {}) {
  const useColour = opts.colour ?? supportsColor();
  const c = useColour ? wrap : (_clr, t) => t;

  const project = input.projectName ? c('bold', input.projectName) : '';
  const model   = input.modelName
    ? c('magenta', `${input.modelName}${input.contextWindow ? ` (${input.contextWindow})` : ''}`)
    : '';

  const ctx       = input.ctxPct != null ? c(ctxColour(input.ctxPct), `● ${formatPct(input.ctxPct)} ctx`) : '';
  const duration  = input.durationMs != null ? c('dim', `⏱ ${formatDuration(input.durationMs)}`) : '';
  const costStr   = formatCost(input.costUsd);
  const cost      = costStr ? (costColour(input.costUsd) ? c(costColour(input.costUsd), costStr) : costStr) : '';
  const loc       = formatLoc(input.linesAdded, input.linesRemoved);
  const locStr    = loc ? c('dim', loc) : '';

  const line1 = ['▌', project, model].filter(Boolean).join('  ');
  const line2 = ['  ', ctx, duration, cost, locStr].filter(Boolean).join('  ');
  return `${line1}\n${line2}`;
}
