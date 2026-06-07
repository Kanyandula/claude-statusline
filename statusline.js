// claude-statusline v2 — single runtime module.
//
// This file owns ALL stdin field access (the "one adapter" rule): schema drift
// is a one-line fix here, never scattered through the renderer. Phase A1 ships
// the adapter + view-model; layout/colorize/emit land in later A-tasks.

import { basename } from 'node:path';

// ── stdin parsing ────────────────────────────────────────────────────────────

// Parse the raw stdin string into a plain object, or null on anything that
// isn't a JSON object (empty, malformed, array, primitive).
export function parseInput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

// Strip C0 (0x00–0x1F), DEL (0x7F), and C1 (0x80–0x9F) control characters.
// Every string that originates outside our codebase (project dir, model name,
// output style, git branch) flows into ANSI output, so a value like
// `foo\x1b]0;PWNED\x07` could otherwise hijack the terminal title. Sanitise
// before anything touches the renderer.
export function stripControlChars(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

// ── ANSI color (ported from v1) ──────────────────────────────────────────────

const SGR = { red: 31, green: 32, yellow: 33, dim: 2, bold: 1, reset: 0 };

// Wrap text in an SGR escape; `style` is a CODES key or array of keys composed
// into one sequence. Unknown/empty styles pass the text through unchanged.
export function wrap(style, text) {
  const codes = (Array.isArray(style) ? style : [style]).map((s) => SGR[s]).filter((c) => c !== undefined);
  return codes.length ? `\x1b[${codes.join(';')}m${text}\x1b[0m` : text;
}

// NO_COLOR off, FORCE_COLOR on, else stdout TTY. Deployment-specific overrides
// belong in the caller.
export function supportsColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout && process.stdout.isTTY === true;
}

// ── helpers ──────────────────────────────────────────────────────────────────

// A field is a number only if it is genuinely a finite number; everything else
// (string, null, undefined, NaN) collapses to null so the renderer never has to
// guard against NaN.
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A trimmed, control-stripped string, or null if absent/blank.
const str = (v) => {
  if (typeof v !== 'string') return null;
  const clean = stripControlChars(v).trim();
  return clean || null;
};

// Derive a short model name from `model.id` WITHOUT a hardcoded model table:
//   claude-opus-4-8            → opus-4-8
//   claude-haiku-4-5-20251001  → haiku-4-5   (drop trailing release date)
//   claude-opus-4-8[1m]        → opus-4-8    (drop bracket suffix)
function shortModel(id) {
  const s = str(id);
  if (!s) return null;
  return s
    .replace(/^claude-/, '')   // strip vendor prefix
    .replace(/\[[^\]]*\]$/, '') // strip trailing [..] tier marker
    .replace(/-\d{6,}$/, '');   // strip trailing release date (≥6 digits)
}

// ── adapter ──────────────────────────────────────────────────────────────────

// Build the flat, typed, null-tolerant view-model from a parsed payload (or
// null). Git fields are defaulted here; the pipeline overlays real git state
// before render, so the renderer never sees `undefined`.
export function buildViewModel(raw) {
  const r = raw || {};
  const cwd = str(r.workspace?.current_dir) || str(r.cwd);
  const ctx = r.context_window || {};
  const cost = r.cost || {};
  const limits = r.rate_limits || {};

  return {
    projectName: cwd ? basename(cwd) : null,
    modelName: str(r.model?.display_name),       // display_name verbatim
    modelShort: shortModel(r.model?.id),

    contextWindowSize: num(ctx.context_window_size),
    ctxPct: num(ctx.used_percentage),
    remainingPct: num(ctx.remaining_percentage),
    inputTokens: num(ctx.total_input_tokens),
    outputTokens: num(ctx.total_output_tokens),
    exceeds200k: r.exceeds_200k_tokens === true,

    costUsd: num(cost.total_cost_usd),
    durationMs: num(cost.total_duration_ms),
    apiDurationMs: num(cost.total_api_duration_ms),
    linesAdded: num(cost.total_lines_added),
    linesRemoved: num(cost.total_lines_removed),

    outputStyle: str(r.output_style?.name),
    sessionId: str(r.session_id),
    rateLimits: {
      fiveHour: num(limits.five_hour?.used_percentage),
      sevenDay: num(limits.seven_day?.used_percentage),
    },

    // Git defaults — overlaid by the pipeline (Phase B3); never undefined.
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    dirty: false,
  };
}

// readPayload(rawStdin) → ViewModel. The single entry the rest of the pipeline
// builds on.
export function readPayload(raw) {
  return buildViewModel(parseInput(raw));
}

// ── formatters (pure) ────────────────────────────────────────────────────────
// All return display strings (or null when there is nothing to show). Fixed
// widths keep the line from jittering as values change. No color here — that
// is colorize's job (A3).

const BAR_CELLS = 10;

// 10-cell context bar. Null (fresh session / post-/compact) → an all-empty bar
// so the field still renders in a stable width; the caller pairs it with --%.
export function contextBar(pct, cells = BAR_CELLS) {
  if (pct == null) return '▱'.repeat(cells);
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled);
}

// Right-padded to a fixed 4 chars ("8%  ", "100%", "--% ") so the bar's
// trailing edge never shifts.
export function pctLabel(pct) {
  const s = pct == null ? '--%' : `${Math.round(pct)}%`;
  return s.padEnd(4);
}

// Wall-clock duration, auto-scaled. Hours show zero-padded minutes ("1h47m",
// "1h00m"); minutes drop seconds ("7m"); under a minute shows seconds ("45s").
export function formatDuration(ms) {
  if (ms == null || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// "$x.xx" right-padded so the cents column and the next separator stay put as
// the dollar count grows.
export function formatCost(n) {
  if (n == null) return null;
  return `$${n.toFixed(2)}`.padEnd(7);
}

// "+added / −removed" (− is U+2212, matching the plan). Both null → null.
export function formatLoc(added, removed) {
  if (added == null && removed == null) return null;
  return `+${added ?? 0} / −${removed ?? 0}`;
}

// Humanize a context-window size: 1000000 → "1M", 200000 → "200K".
export function sizeLabel(size) {
  if (size == null) return null;
  if (size >= 1_000_000) return `${(size / 1_000_000).toString().replace(/\.0$/, '')}M`;
  if (size >= 1_000) return `${Math.round(size / 1_000)}K`;
  return String(size);
}

// ── spatial layout (pure) ────────────────────────────────────────────────────
// (viewModel, config, paint) → string[] (one entry per line). Two lines: an
// identity line led by the health-pixel glyph, and a state line of metric
// fields. `paint(role, text)` lets colorize wrap fields by threshold; the
// default is identity, so a bare `spatialLayout(vm, config)` is structure-only
// (no color) — the live path golden tests assert against.
const PLAIN = (_role, text) => text;

export function spatialLayout(vm, config = {}, paint = PLAIN) {
  const sep = config.separators ?? '·';
  const defaultSize = config.defaultWindowSize ?? 200000;
  const join = (parts) => parts.filter((p) => p != null && p !== '').join(` ${sep} `);

  // Identity: ▌ project · branch · model [· size-when-non-default].
  // Identity is plain text — only the pixel carries threshold color.
  const model = vm.modelName ?? vm.modelShort ?? null;
  const size =
    vm.contextWindowSize != null && vm.contextWindowSize !== defaultSize
      ? sizeLabel(vm.contextWindowSize)
      : null;
  const identity = `${paint('pixel', '▌')} ${join([
    paint('project', vm.projectName),
    paint('branch', vm.branch),
    paint('model', model),
    paint('size', size),
  ])}`;

  // State: ctx <bar> <pct> · ⏱ <dur> · <cost> · <loc>
  const ctx = paint('ctx', `ctx ${contextBar(vm.ctxPct)} ${pctLabel(vm.ctxPct)}`);
  const dur = vm.durationMs != null ? paint('duration', `⏱ ${formatDuration(vm.durationMs)}`) : null;
  const cost = paint('cost', formatCost(vm.costUsd));
  const loc = paint('loc', formatLoc(vm.linesAdded, vm.linesRemoved));
  const state = join([ctx, dur, cost, loc]);

  return [identity, state];
}

// ── threshold → color (A3) ───────────────────────────────────────────────────
// One severity mapping drives every threshold field and the health pixel.

export const DEFAULT_THRESHOLDS = {
  context: { warn: 60, danger: 85 },
  cost: { warn: 5, danger: 20 },
};

function resolveThresholds(config) {
  const t = config.thresholds || {};
  return {
    context: { ...DEFAULT_THRESHOLDS.context, ...t.context },
    cost: { ...DEFAULT_THRESHOLDS.cost, ...t.cost },
  };
}

// -1 no-signal (null), 0 green, 1 yellow (≥warn), 2 red (≥danger).
export function severity(value, warn, danger) {
  if (value == null) return -1;
  if (value >= danger) return 2;
  if (value >= warn) return 1;
  return 0;
}

const SEV_COLOR = { '-1': 'dim', 0: 'green', 1: 'yellow', 2: 'red' };

// Worst (highest) severity among the present signals; -1 if none present, so a
// fresh session shows a dim pixel rather than flashing red.
function worstSeverity(severities) {
  const present = severities.filter((s) => s >= 0);
  return present.length ? Math.max(...present) : -1;
}

// Build the painter colorize injects into spatialLayout. Threshold roles (ctx,
// cost, pixel) get a band color; identity/metric roles pass through plain.
function makePainter(vm, config, useColour) {
  const t = resolveThresholds(config);
  const ctxSev = severity(vm.ctxPct, t.context.warn, t.context.danger);
  const costSev = severity(vm.costUsd, t.cost.warn, t.cost.danger);
  const colorByRole = {
    pixel: SEV_COLOR[worstSeverity([ctxSev, costSev])],
    ctx: SEV_COLOR[ctxSev],
    cost: SEV_COLOR[costSev],
  };
  const w = useColour ? wrap : PLAIN;
  return (role, text) => {
    if (text == null) return text;
    const clr = colorByRole[role];
    return clr ? w(clr, text) : text;
  };
}

// colorize(vm, config, useColour) → string[]. The same two lines as
// spatialLayout, with threshold color applied. Stripping the ANSI yields the
// exact structure layout (golden-test invariant).
export function colorize(vm, config = {}, useColour = supportsColor()) {
  return spatialLayout(vm, config, makePainter(vm, config, useColour));
}
