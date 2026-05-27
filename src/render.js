import { formatCost, formatDuration, formatPct, formatLoc } from './format.js';
import { wrap, supportsColor } from './ansi.js';
import { DEFAULT_CONFIG } from './config.js';

function ctxColour(pct, t) {
  if (pct == null) return 'dim';
  if (pct >= t.ctxDangerPct) return 'red';
  if (pct >= t.ctxWarnPct) return 'yellow';
  return 'green';
}

function costColour(usd, t) {
  if (usd == null) return null;
  if (usd >= t.costDangerUsd) return 'red';
  if (usd >= t.costWarnUsd) return 'yellow';
  return null;
}

function apiRatioStr(input) {
  if (input.apiDurationMs == null || input.durationMs == null || input.durationMs <= 0) return '';
  const pct = Math.round((input.apiDurationMs / input.durationMs) * 100);
  return `🌐 ${pct}%`;
}

export function render(input, opts = {}) {
  const config    = opts.config ?? DEFAULT_CONFIG;
  const useColour = opts.colour ?? supportsColor();
  const c = useColour ? wrap : (_clr, t) => t;
  const f = config.fields;
  const t = config.thresholds;

  const parts = {
    project: (f.project && input.projectName) ? c(['bold', 'brightMagenta'], input.projectName) : '',
    branch:  (f.branch && input.branch)
      ? `${c(['bold', 'brightCyan'], `⎇ ${input.branch}`)}${input.dirty ? c('brightRed', '*') : ''}`
      : '',
    model:   (f.model && input.modelName)
      ? c(['bold', 'brightBlue'], `${input.modelName}${input.contextWindow ? ` (${input.contextWindow})` : ''}`)
      : '',
    ctx:     (f.ctx && input.ctxPct != null)
      ? c(ctxColour(input.ctxPct, t), `● ${formatPct(input.ctxPct)} ctx`)
      : '',
    duration: (f.duration && input.durationMs != null)
      ? c('dim', `⏱ ${formatDuration(input.durationMs)}`)
      : '',
    cost: (() => {
      if (!f.cost) return '';
      const s = formatCost(input.costUsd);
      if (!s) return '';
      const clr = costColour(input.costUsd, t);
      return clr ? c(clr, s) : s;
    })(),
    loc: (() => {
      if (!f.loc) return '';
      const s = formatLoc(input.linesAdded, input.linesRemoved);
      return s ? c('dim', s) : '';
    })(),
    apiRatio: (() => {
      if (!f.apiRatio) return '';
      const s = apiRatioStr(input);
      return s ? c('dim', s) : '';
    })(),
    outputStyle: (f.outputStyle && input.outputStyle) ? c('dim', `📐 ${input.outputStyle}`) : '',
  };

  const bar    = c('dim', '▌');
  const sep    = `  ${c('dim', '│')}  `;

  if (config.layout === 'single') {
    const compactModel = (f.model && input.modelName)
      ? c(['bold', 'brightBlue'], `${input.modelName}${input.contextShort ? ` (${input.contextShort})` : ''}`)
      : '';
    const compactLocStr = f.loc ? formatLoc(input.linesAdded, input.linesRemoved, { compact: true }) : '';
    const compactLoc = compactLocStr ? c('dim', compactLocStr) : '';
    const items = [parts.project, parts.branch, compactModel, parts.ctx, parts.duration, parts.cost,
                   compactLoc, parts.apiRatio, parts.outputStyle].filter(Boolean);
    return items.length ? `${bar}  ${items.join(sep)}` : bar;
  }

  const line1Items = [parts.project, parts.branch, parts.model].filter(Boolean);
  const line2Items = [parts.ctx, parts.duration, parts.cost, parts.loc, parts.apiRatio, parts.outputStyle].filter(Boolean);
  const line1 = line1Items.length ? `${bar}  ${line1Items.join(sep)}` : bar;
  const line2 = line2Items.length ? `  ${line2Items.join(sep)}` : '';
  return line2 ? `${line1}\n${line2}` : line1;
}
