import { formatCost, formatDuration, formatPct, formatLoc } from './format.js';
import { wrap, supportsColor, stripControlChars } from './ansi.js';
import { DEFAULT_CONFIG } from './config.js';

// Sanitiser alias for user-supplied strings that flow through wrap().
const safe = stripControlChars;

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

// Build the model+context label. `ctxLabel` is the long form ("1M context")
// for two-line layout and the short form ("1M") for single — both use the
// same colour and sanitiser, so callers just pick the label.
function modelPart(input, ctxLabel, c) {
  if (!input.modelName) return '';
  const ctx = ctxLabel ? ` (${safe(ctxLabel)})` : '';
  return c(['bold', 'brightBlue'], `${safe(input.modelName)}${ctx}`);
}

// Field registry — the single source of truth for what renders, in what order,
// and on which line of the two-line layout. Adding a field is one entry here
// (plus its default in config.js). `key` matches the config.fields flag; `line`
// is the two-line row (1 = top, 2 = metrics); `build(input, c, t, compact)`
// returns the coloured segment, or '' when the field has no data. `compact` is
// true under the single-line layout — only model and loc vary on it.
//
// Array order IS the render order: single-line joins every enabled segment in
// this order; two-line groups by `line`, preserving order within each row.
const FIELDS = [
  { key: 'project', line: 1, build: (i, c) =>
      i.projectName ? c(['bold', 'brightMagenta'], safe(i.projectName)) : '' },
  { key: 'branch', line: 1, build: (i, c) =>
      i.branch
        ? `${c(['bold', 'brightCyan'], `⎇ ${safe(i.branch)}`)}${i.dirty ? c('brightRed', '*') : ''}`
        : '' },
  { key: 'model', line: 1, build: (i, c, t, compact) =>
      modelPart(i, compact ? i.contextShort : i.contextWindow, c) },
  { key: 'ctx', line: 2, build: (i, c, t) =>
      i.ctxPct != null ? c(ctxColour(i.ctxPct, t), `● ${formatPct(i.ctxPct)} ctx`) : '' },
  { key: 'duration', line: 2, build: (i, c) =>
      i.durationMs != null ? c('yellow', `⏱ ${formatDuration(i.durationMs)}`) : '' },
  { key: 'cost', line: 2, build: (i, c, t) => {
      const s = formatCost(i.costUsd);
      if (!s) return '';
      const clr = costColour(i.costUsd, t);
      return clr ? c(clr, s) : s;
    } },
  { key: 'loc', line: 2, build: (i, c, t, compact) => {
      const s = formatLoc(i.linesAdded, i.linesRemoved, { compact });
      return s ? c('yellow', s) : '';
    } },
  { key: 'apiRatio', line: 2, build: (i, c) => {
      const s = apiRatioStr(i);
      return s ? c('yellow', s) : '';
    } },
  { key: 'outputStyle', line: 2, build: (i, c) =>
      i.outputStyle ? c('yellow', `📐 ${safe(i.outputStyle)}`) : '' },
];

export function render(input, opts = {}) {
  const config    = opts.config ?? DEFAULT_CONFIG;
  const useColour = opts.colour ?? supportsColor();
  const c = useColour ? wrap : (_clr, t) => t;
  const f = config.fields;
  const t = config.thresholds;
  const compact = config.layout === 'single';

  const bar = c('dim', '▌');
  const sep = `  ${c('dim', '│')}  `;

  // Build each enabled field once; disabled fields collapse to ''.
  const built = FIELDS.map(field => ({
    line: field.line,
    text: f[field.key] ? field.build(input, c, t, compact) : '',
  }));

  if (compact) {
    const items = built.map(b => b.text).filter(Boolean);
    return items.length ? `${bar}  ${items.join(sep)}` : bar;
  }

  const line1Items = built.filter(b => b.line === 1).map(b => b.text).filter(Boolean);
  const line2Items = built.filter(b => b.line === 2).map(b => b.text).filter(Boolean);
  const line1 = line1Items.length ? `${bar}  ${line1Items.join(sep)}` : bar;
  const line2 = line2Items.length ? `  ${line2Items.join(sep)}` : '';
  return line2 ? `${line1}\n${line2}` : line1;
}
