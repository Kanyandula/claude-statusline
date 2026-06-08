// claude-statusline v2 — single runtime module.
//
// This file owns ALL stdin field access (the "one adapter" rule): schema drift
// is a one-line fix here, never scattered through the renderer. Phase A1 ships
// the adapter + view-model; layout/colorize/emit land in later A-tasks.

import { basename, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

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

// Downsample an (r,g,b) to an xterm-256 index — grayscale ramp when r≈g≈b, else
// the 6×6×6 color cube — so truecolor hexes render (approximately) on 256-color
// terminals like Apple Terminal.
const CUBE = [0, 95, 135, 175, 215, 255];
const cubeIdx = (v) => CUBE.reduce((best, lvl, i) => (Math.abs(lvl - v) < Math.abs(CUBE[best] - v) ? i : best), 0);
function rgbTo256(r, g, b) {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  return 16 + 36 * cubeIdx(r) + 6 * cubeIdx(g) + cubeIdx(b);
}

// SGR params for a hex color at `base` (38 fg / 48 bg), honoring color depth.
function hexCode(hex, base, depth) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return depth === '256'
    ? [String(base), '5', String(rgbTo256(r, g, b))]
    : [String(base), '2', String(r), String(g), String(b)];
}

// Resolve one style token to SGR params: a named ANSI code ('green'), a raw
// number, or a truecolor hex ('#rrggbb' → 38;2;… or 38;5;… per depth).
function sgrParams(token, depth) {
  if (typeof token === 'number') return [String(token)];
  if (typeof token === 'string' && /^#[0-9a-f]{6}$/i.test(token)) return hexCode(token, 38, depth);
  return SGR[token] !== undefined ? [String(SGR[token])] : [];
}

// Wrap text in an SGR escape; `style` is a token or array of tokens composed
// into one sequence. `depth` controls hex rendering (truecolor vs 256).
export function wrap(style, text, depth = 'truecolor') {
  const codes = (Array.isArray(style) ? style : [style]).flatMap((t) => sgrParams(t, depth));
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

// Some CC display_names embed the window, e.g. "Opus 4.8 (1M context)". Strip a
// trailing "(… context)" so the size label derived from context_window_size is
// the single source — otherwise the window shows twice ("… (1M context) · 1M").
// Conservative: only strips a trailing parenthetical that mentions "context".
function modelBaseName(displayName) {
  const s = str(displayName);
  if (!s) return null;
  return s.replace(/\s*\([^()]*\bcontext\b[^()]*\)\s*$/i, '').trim() || s;
}

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
    cwd: cwd || null,                            // full dir — where the git overlay runs
    projectName: cwd ? basename(cwd) : null,
    modelName: modelBaseName(r.model?.display_name), // strips embedded "(… context)"
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

// Session-average burn rate: cost ÷ wall-clock hours. Wall-clock (not API time)
// because idle time is still spend. Stateless and labeled an average — a
// rolling/"current" rate would need a session-keyed state file (out of scope).
// Self-suppresses (null) when cost is absent or duration is 0 (first tick).
export function formatBurnRate(costUsd, durationMs) {
  if (costUsd == null || durationMs == null || durationMs <= 0) return null;
  const rate = costUsd / (durationMs / 3_600_000);
  return `↑$${rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1)}/h`;
}

// Truncate an over-long string with a trailing ellipsis so the identity line
// can't blow out the terminal width. max counts the visible characters,
// ellipsis included.
export function truncate(s, max) {
  if (typeof s !== 'string' || s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

// Humanize a context-window size: 1000000 → "1M", 200000 → "200K".
export function sizeLabel(size) {
  if (size == null) return null;
  if (size >= 1_000_000) return `${(size / 1_000_000).toString().replace(/\.0$/, '')}M`;
  if (size >= 1_000) return `${Math.round(size / 1_000)}K`;
  return String(size);
}

// ── layouts (pure) ───────────────────────────────────────────────────────────
// (viewModel, config, paint) → string[] (one entry per line). `paint(role,
// text)` lets colorize wrap fields by threshold; the default is identity, so a
// bare `…Layout(vm, config)` is structure-only — the live path golden tests
// assert against. spatial/compact/zen are ARRANGEMENTS over one field source
// (rawFields), not separate render code paths.
const PLAIN = (_role, text) => text;

// The single source of every field's raw (unpainted) text, keyed by role.
// Layouts only choose which roles to show and how to group them into lines.
function rawFields(vm, config) {
  const defaultSize = config.defaultWindowSize ?? 200000;
  const size =
    vm.contextWindowSize != null && vm.contextWindowSize !== defaultSize
      ? sizeLabel(vm.contextWindowSize)
      : null;
  return {
    project: vm.projectName != null ? truncate(vm.projectName, config.maxProjectWidth ?? 24) : null,
    branch: branchLabel(vm, { aheadBehind: config.fields?.gitAheadBehind ?? true }),
    model: vm.modelName ?? vm.modelShort ?? null,
    size,
    ctx: `ctx ${contextBar(vm.ctxPct)} ${pctLabel(vm.ctxPct)}`,
    ctxPct: pctLabel(vm.ctxPct).trim(), // bare "NN%" for zen
    duration: vm.durationMs != null ? `⏱ ${formatDuration(vm.durationMs)}` : null,
    cost: formatCost(vm.costUsd),
    burn: config.fields?.burnRate ? formatBurnRate(vm.costUsd, vm.durationMs) : null,
    loc: formatLoc(vm.linesAdded, vm.linesRemoved),
  };
}

// Assemble one line from [role, text] pairs: drop empties, strip the terminal
// field's trailing fixed-width pad (alignment only matters between fields, so it
// would just be junk whitespace at line-end), then paint and join. Trimming
// before paint keeps plain and colored output identical under ANSI-strip.
function assembleLine(pairs, sep, paint) {
  const present = pairs.filter((p) => p && p[1] != null && p[1] !== '');
  if (present.length) {
    const last = present[present.length - 1];
    present[present.length - 1] = [last[0], last[1].replace(/\s+$/, '')];
  }
  return present.map(([role, text]) => paint(role, text)).join(` ${sep} `);
}

// Prefix a body with the (painted) health pixel, or just the pixel if empty.
const withPixel = (body, paint) => {
  const pixel = paint('pixel', '▌');
  return body ? `${pixel} ${body}` : pixel;
};

// spatial (default): two lines — identity, then state.
export function spatialLayout(vm, config = {}, paint = PLAIN) {
  const sep = config.separators ?? '·';
  const f = rawFields(vm, config);
  const identity = withPixel(
    assembleLine([['project', f.project], ['branch', f.branch], ['model', f.model], ['size', f.size]], sep, paint),
    paint,
  );
  const state = assembleLine(
    [['ctx', f.ctx], ['duration', f.duration], ['cost', f.cost], ['burn', f.burn], ['loc', f.loc]],
    sep, paint,
  );
  return [identity, state];
}

// compact: the same fields, on one line.
export function compactLayout(vm, config = {}, paint = PLAIN) {
  const sep = config.separators ?? '·';
  const f = rawFields(vm, config);
  const body = assembleLine([
    ['project', f.project], ['branch', f.branch], ['model', f.model], ['size', f.size],
    ['ctx', f.ctx], ['duration', f.duration], ['cost', f.cost], ['burn', f.burn], ['loc', f.loc],
  ], sep, paint);
  return [withPixel(body, paint)];
}

// zen: project · model · ctx% · cost. Color is the only escalation signal —
// no bar, branch, duration, or loc.
export function zenLayout(vm, config = {}, paint = PLAIN) {
  const sep = config.separators ?? '·';
  const f = rawFields(vm, config);
  const body = assembleLine([
    ['project', f.project], ['model', f.model], ['ctx', f.ctxPct], ['cost', f.cost],
  ], sep, paint);
  return [withPixel(body, paint)];
}

// powerline (opt-in, needs a Nerd Font): one line of background-filled segments
// joined by the powerline arrow . A distinct render path — it uses background
// color and transition arrows rather than the foreground role-painter, so it
// bypasses the theme system. Strips to a stable structure (same glyphs, color
// removed). Without a Nerd Font the arrows render as tofu — hence opt-in.
const PL_SEP = '';
const PL_BAND = (s) => (s === 2 ? '#da3633' : s === 1 ? '#9e6a03' : '#238636'); // red/amber/green bg

function powerlineSegments(vm, config) {
  const t = resolveThresholds(config);
  const f = rawFields(vm, config);
  const segs = [];
  if (f.project) segs.push({ text: f.project, fg: '#1a1030', bg: '#bc8cff', bold: true });
  if (vm.branch) segs.push({ text: `⎇ ${branchLabel(vm, { aheadBehind: config.fields?.gitAheadBehind ?? true })}`, fg: '#c9d1d9', bg: '#30363d' });
  if (f.model) segs.push({ text: f.size ? `${f.model} ${f.size}` : f.model, fg: '#ffffff', bg: '#1f6feb' });
  if (vm.ctxPct != null) segs.push({ text: `● ${Math.round(vm.ctxPct)}%`, fg: '#ffffff', bg: PL_BAND(severity(vm.ctxPct, t.context.warn, t.context.danger)) });
  if (vm.costUsd != null) segs.push({ text: `$${vm.costUsd.toFixed(2)}`, fg: '#ffffff', bg: PL_BAND(severity(vm.costUsd, t.cost.warn, t.cost.danger)) });
  const loc = formatLoc(vm.linesAdded, vm.linesRemoved);
  if (loc) segs.push({ text: loc.replace(' / ', '/'), fg: '#ffffff', bg: '#238636' });
  return segs;
}

export function powerlineLayout(vm, config = {}, useColour = supportsColor(), depth) {
  const d = depth ?? (config.colorDepth === '256' ? '256' : 'truecolor');
  const segs = powerlineSegments(vm, config);
  let out = '';
  segs.forEach((s, i) => {
    const body = ` ${s.text} `;
    const next = segs[i + 1];
    if (useColour) {
      const seg = [];
      if (s.bold) seg.push('1');
      seg.push(...hexCode(s.fg, 38, d), ...hexCode(s.bg, 48, d));
      const arrow = [...hexCode(s.bg, 38, d), ...(next ? hexCode(next.bg, 48, d) : [])];
      out += `\x1b[${seg.join(';')}m${body}\x1b[0m\x1b[${arrow.join(';')}m${PL_SEP}\x1b[0m`;
    } else {
      out += body + PL_SEP;   // same glyphs, no color → strip(colored) === plain
    }
  });
  return [out];
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

// ── themes ───────────────────────────────────────────────────────────────────
// A theme is `paint(role, text, sev, w)` → painted string. minimal keeps the
// terminal's ANSI palette and only colors the threshold roles (identity plain).
// vivid is the design-mock palette: truecolor hex, colored identity, split LOC,
// and a calm purple pixel that only turns red in the danger band.

const HEX = {
  purple: '#bc8cff', pink: '#ff7bd5', blue: '#58a6ff', gray: '#6e7681',
  amber: '#d29922', green: '#3fb950', red: '#f85149',
};

const vividSev = (s) => (s === 2 ? HEX.red : s === 1 ? HEX.amber : s === 0 ? HEX.green : HEX.gray);

// Split "+added / −removed" into green / dim / red without changing any
// character (so ANSI-strip still yields the structure text).
function vividLoc(text, w) {
  const m = text.match(/^(\+\d+)( \/ )(−\d+)$/);
  return m ? w(HEX.green, m[1]) + w(HEX.gray, m[2]) + w(HEX.red, m[3]) : w(HEX.gray, text);
}

const THEMES = {
  minimal: (role, text, sev, w) => {
    const clr = { pixel: SEV_COLOR[sev.pixel], ctx: SEV_COLOR[sev.ctx], cost: SEV_COLOR[sev.cost] }[role];
    return clr ? w(clr, text) : text;
  },
  vivid: (role, text, sev, w) => {
    switch (role) {
      case 'pixel': return w(sev.pixel >= 2 ? HEX.red : HEX.purple, text);
      case 'project': return w(['bold', HEX.pink], text);
      case 'branch': return w(HEX.gray, text);
      case 'model': case 'size': return w(HEX.blue, text);
      case 'duration': case 'burn': return w(HEX.gray, text);
      case 'ctx': return w(vividSev(sev.ctx), text);
      case 'cost': return w(vividSev(sev.cost), text);
      case 'loc': return vividLoc(text, w);
      default: return text;
    }
  },
};
export const KNOWN_THEMES = Object.keys(THEMES);

// Build the painter colorize injects into the layout. Computes the severity of
// each threshold role once and delegates per-role coloring to the theme.
function makePainter(vm, config, useColour, depth) {
  const theme = THEMES[config?.theme] ?? THEMES.minimal;
  const t = resolveThresholds(config);
  const ctx = severity(vm.ctxPct, t.context.warn, t.context.danger);
  const cost = severity(vm.costUsd, t.cost.warn, t.cost.danger);
  const sev = { ctx, cost, pixel: worstSeverity([ctx, cost]) };
  const w = useColour ? (spec, text) => wrap(spec, text, depth) : PLAIN;
  return (role, text) => (text == null ? text : theme(role, text, sev, w));
}

// Layout registry. spatial/compact/zen are painter-based (vm, config, paint);
// powerline is a distinct render path handled in colorize. Unknown ⇒ spatial.
const LAYOUTS = { spatial: spatialLayout, compact: compactLayout, zen: zenLayout };
export const IMPLEMENTED_LAYOUTS = [...Object.keys(LAYOUTS), 'powerline'];
function layoutFor(config) {
  return LAYOUTS[config?.layout] ?? spatialLayout;
}

// Resolve the effective color depth. Explicit config wins; 'auto' (the default)
// downgrades to 256 only for Apple Terminal — a reliable positive ID — since
// COLORTERM is unreliable there. Other terminals get truecolor.
export function resolveColorDepth(config = {}, env = process.env) {
  const cd = config.colorDepth;
  if (cd === '256' || cd === 'truecolor') return cd;
  return env.TERM_PROGRAM === 'Apple_Terminal' ? '256' : 'truecolor';
}

// colorize(vm, config, useColour, depth) → string[]. The selected layout with
// threshold color applied. `depth` controls truecolor vs 256 hex output (the
// entry resolves it from env; pure callers default to truecolor unless
// config.colorDepth forces 256). Stripping the ANSI yields the exact structure
// layout (golden-test invariant) regardless of depth.
export function colorize(vm, config = {}, useColour = supportsColor(), depth) {
  const d = depth ?? (config.colorDepth === '256' ? '256' : 'truecolor');
  if (config?.layout === 'powerline') return powerlineLayout(vm, config, useColour, d);
  return layoutFor(config)(vm, config, makePainter(vm, config, useColour, d));
}

// ── config (B5) ──────────────────────────────────────────────────────────────
// Single resolved config: defaults → user file (~/.claude/statusline.json) →
// env. Normalized to the known schema (wrong-typed values fall back, unknown
// keys dropped) so a hand-edited file can't blank the bar or NaN the thresholds.

export const DEFAULT_CONFIG = {
  layout: 'spatial',
  theme: 'minimal',
  colorDepth: 'auto',
  separators: '·',
  defaultWindowSize: 200000,
  maxProjectWidth: 24,
  thresholds: {
    context: { warn: 60, danger: 85 },
    cost: { warn: 5, danger: 20 },
  },
  fields: {
    burnRate: false,
    apiRatio: false,
    outputStyle: false,
    gitAheadBehind: true,
    rateLimits: false,
  },
};

function defaultConfigPath() {
  return join(homedir(), '.claude', 'statusline.json');
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finiteNum = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// Reject paths that aren't an absolute *.json — guards against a stray
// CLAUDE_STATUSLINE_CONFIG pointing the loader at /etc/passwd or a relative
// cwd-dependent file whose JSON-shaped content could leak into config.
export function isAllowedConfigPath(p) {
  return typeof p === 'string' && p.length > 0 && isAbsolute(p) && /\.json$/i.test(p);
}

function readJsonSafe(path) {
  if (!isAllowedConfigPath(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function deepMerge(base, over) {
  if (!isPlainObject(over)) return base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    const a = base?.[k];
    const b = over[k];
    out[k] = isPlainObject(a) && isPlainObject(b) ? deepMerge(a, b) : b;
  }
  return out;
}

function applyEnv(cfg, env) {
  if (!isPlainObject(env)) return cfg;
  let out = cfg;
  if (IMPLEMENTED_LAYOUTS.includes(env.CLAUDE_STATUSLINE_LAYOUT)) {
    out = { ...out, layout: env.CLAUDE_STATUSLINE_LAYOUT };
  }
  return out;
}

// Rebuild from defaults taking only correctly-typed values; drop unknown keys.
function normalizeConfig(cfg) {
  const s = isPlainObject(cfg) ? cfg : {};
  const st = isPlainObject(s.thresholds) ? s.thresholds : {};
  const band = (src, def) => ({
    warn: finiteNum(src?.warn, def.warn),
    danger: finiteNum(src?.danger, def.danger),
  });
  const sf = isPlainObject(s.fields) ? s.fields : {};
  const fields = {};
  for (const k of Object.keys(DEFAULT_CONFIG.fields)) {
    fields[k] = typeof sf[k] === 'boolean' ? sf[k] : DEFAULT_CONFIG.fields[k];
  }
  const mpw = finiteNum(s.maxProjectWidth, DEFAULT_CONFIG.maxProjectWidth);
  return {
    layout: IMPLEMENTED_LAYOUTS.includes(s.layout) ? s.layout : DEFAULT_CONFIG.layout,
    theme: KNOWN_THEMES.includes(s.theme) ? s.theme : DEFAULT_CONFIG.theme,
    colorDepth: ['auto', 'truecolor', '256'].includes(s.colorDepth) ? s.colorDepth : DEFAULT_CONFIG.colorDepth,
    separators: typeof s.separators === 'string' && s.separators ? s.separators : DEFAULT_CONFIG.separators,
    defaultWindowSize: finiteNum(s.defaultWindowSize, DEFAULT_CONFIG.defaultWindowSize),
    maxProjectWidth: mpw > 0 ? Math.floor(mpw) : DEFAULT_CONFIG.maxProjectWidth,
    thresholds: {
      context: band(st.context, DEFAULT_CONFIG.thresholds.context),
      cost: band(st.cost, DEFAULT_CONFIG.thresholds.cost),
    },
    fields,
  };
}

export function loadConfig({ userPath, env = process.env } = {}) {
  const path = userPath ?? env.CLAUDE_STATUSLINE_CONFIG ?? defaultConfigPath();
  let cfg = deepMerge(DEFAULT_CONFIG, readJsonSafe(path));
  cfg = applyEnv(cfg, env);
  return normalizeConfig(cfg);
}

// ── git overlay (B3) ─────────────────────────────────────────────────────────
// A single `git status --porcelain=v2 --branch`, parsed to a small record and
// overlaid onto the view-model. Runs only on Claude Code's event-updates (no
// refreshInterval by default — OD-1), so re-shelling on an idle timer never
// happens and no state file is needed.

// Parse porcelain=v2 --branch output. Any non-`#` line means a working-tree
// change ⇒ dirty. Branch/upstream are control-char-stripped (they reach ANSI
// output and could otherwise carry an escape sequence).
export function parseGitStatus(stdout) {
  if (typeof stdout !== 'string') return null;
  let branch = null, upstream = null, ahead = 0, behind = 0, dirty = false;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim();
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) { ahead = Number(m[1]); behind = Number(m[2]); }
    } else if (line !== '' && !line.startsWith('#')) {
      dirty = true;
    }
  }
  branch = branch ? stripControlChars(branch).trim() || null : null;
  upstream = upstream ? stripControlChars(upstream).trim() || null : null;
  if (branch === '(detached)') branch = null;   // detached HEAD → no named branch
  return { branch, upstream, ahead, behind, dirty };
}

// Run git in `cwd`. Plain invocation: no `-c core.fsmonitor=` (that would
// disable the very speedup large repos rely on) — we benefit from the user's
// fsmonitor/untrackedCache if they set them. Bounded at 1s and fully guarded:
// a missing dir, non-git tree, hung lock, or timeout all degrade to null (no
// git segment) rather than hanging or throwing.
function defaultGitExec(cwd) {
  try {
    const r = spawnSync('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], {
      encoding: 'utf8', timeout: 1000, windowsHide: true,
    });
    if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
    return r.stdout;
  } catch {
    return null;
  }
}

export function gitInfo(cwd, exec = defaultGitExec) {
  if (!cwd || typeof cwd !== 'string') return null;
  const out = exec(cwd);
  return out == null ? null : parseGitStatus(out);
}

// Merge git state onto the view-model (no-op when git is null).
export function overlayGit(vm, git) {
  if (!git) return vm;
  return { ...vm, branch: git.branch, upstream: git.upstream, ahead: git.ahead, behind: git.behind, dirty: git.dirty };
}

// Compose the identity-line branch segment: name + dirty star + ahead/behind.
// `aheadBehind` (config field gitAheadBehind) gates the ↑/↓ counts.
export function branchLabel(vm, { aheadBehind = true } = {}) {
  if (!vm.branch) return null;
  let s = `${vm.branch}${vm.dirty ? '*' : ''}`;
  if (aheadBehind) {
    if (vm.ahead) s += ` ↑${vm.ahead}`;
    if (vm.behind) s += ` ↓${vm.behind}`;
  }
  return s;
}

// ── entry (emit) ─────────────────────────────────────────────────────────────

// render raw stdin to the final multi-line string. Overlays git for the
// payload's cwd (injectable via `git` for tests). Config loading lands in B5;
// for now the defaults drive everything.
export function renderLine(raw, { config = {}, useColour, git, depth } = {}) {
  const vm = readPayload(raw);
  const info = git !== undefined ? git : gitInfo(vm.cwd);
  return colorize(overlayGit(vm, info), config, useColour ?? supportsColor(), depth).join('\n');
}

// Statusline payloads are tiny; cap stdin at 1 MB so a wedged upstream pipe
// can't make us buffer unboundedly.
const MAX_STDIN = 1024 * 1024;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      if (data.length < MAX_STDIN) data += chunk;
    });
    process.stdin.on('end', () => resolve(data.slice(0, MAX_STDIN)));
    process.stdin.on('error', () => resolve(data.slice(0, MAX_STDIN)));
  });
}

async function main(argv = process.argv.slice(2)) {
  // Claude Code pipes our stdout (non-TTY) yet renders our ANSI, so the
  // installed command passes --color to override TTY detection. --no-color
  // forces plain. Otherwise fall back to NO_COLOR/FORCE_COLOR/TTY.
  let useColour;
  if (argv.includes('--color')) useColour = true;
  else if (argv.includes('--no-color')) useColour = false;
  const config = loadConfig({ env: process.env });
  const depth = resolveColorDepth(config, process.env);
  process.stdout.write(renderLine(await readStdin(), { useColour, config, depth }) + '\n');
}

// Run only when executed directly (`node statusline.js`), never when imported by
// tests. EPIPE: the terminal can close our pipe mid-write — exit quietly.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });
  main();
}
