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
