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
    project: (f.project && input.projectName) ? c('bold', input.projectName) : '',
    branch:  (f.branch && input.branch)
      ? `${c('cyan', `⎇ ${input.branch}`)}${input.dirty ? c('red', '*') : ''}`
      : '',
    model:   (f.model && input.modelName)
      ? c('magenta', `${input.modelName}${input.contextWindow ? ` (${input.contextWindow})` : ''}`)
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

  if (config.layout === 'single') {
    const compactModel = (f.model && input.modelName)
      ? c('magenta', `${input.modelName}${input.contextShort ? ` (${input.contextShort})` : ''}`)
      : '';
    const compactLocStr = f.loc ? formatLoc(input.linesAdded, input.linesRemoved, { compact: true }) : '';
    const compactLoc = compactLocStr ? c('dim', compactLocStr) : '';
    return ['▌', parts.project, parts.branch, compactModel, parts.ctx, parts.duration, parts.cost,
            compactLoc, parts.apiRatio, parts.outputStyle].filter(Boolean).join('  ');
  }

  const line1 = ['▌', parts.project, parts.branch, parts.model].filter(Boolean).join('  ');
  const line2 = ['  ', parts.ctx, parts.duration, parts.cost, parts.loc, parts.apiRatio, parts.outputStyle]
    .filter(Boolean).join('  ');
  return `${line1}\n${line2}`;
}
