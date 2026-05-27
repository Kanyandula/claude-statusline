import { basename } from 'node:path';
import { contextWindowLabel, contextWindowShortLabel } from '../models.js';

// Claude's `model.display_name` may already include a trailing context-window
// label like "Opus 4.7 (1M context)". Split it so the renderer can pick the
// right form per layout without doubling up.
//
// Grammar (deliberately strict): `<base>` followed by one paren-group at end.
// The base AND the paren content are both `[^()]+`, so:
//   - multi-paren strings like "Foo (bar) (baz)" don't match → fallback
//   - empty parens "Foo ()" don't match → fallback
//   - trailing junk "Foo (1M) [v2]" doesn't match → fallback
// The fallback keeps the raw display_name as base and uses model.id for label.
const PAREN_GRAMMAR = /^([^()]+?)\s*\(([^()]+)\)\s*$/;
const CONTEXT_SUFFIX = /\s*context\s*$/i;

function splitDisplayName(displayName, modelId) {
  if (!displayName) return { base: null, long: null, short: null };
  const m = displayName.match(PAREN_GRAMMAR);
  if (m) {
    const base = m[1];
    const long = m[2];
    const short = long.replace(CONTEXT_SUFFIX, '');
    return { base, long, short };
  }
  // Unparseable display_name — keep the raw string and fall back to model-id lookup.
  return {
    base:  displayName,
    long:  modelId ? contextWindowLabel(modelId) || null : null,
    short: modelId ? contextWindowShortLabel(modelId) || null : null,
  };
}

export function claudeAdapter(raw) {
  const r = raw || {};
  const cwd = r.workspace?.current_dir || r.cwd || null;
  const modelId = r.model?.id || null;
  const { base, long, short } = splitDisplayName(r.model?.display_name ?? null, modelId);
  return {
    projectName:   cwd ? basename(cwd) : null,
    modelName:     base,
    contextWindow: long,
    contextShort:  short,
    costUsd:       typeof r.cost?.total_cost_usd === 'number' ? r.cost.total_cost_usd : null,
    durationMs:    typeof r.cost?.total_duration_ms === 'number' ? r.cost.total_duration_ms : null,
    apiDurationMs: typeof r.cost?.total_api_duration_ms === 'number' ? r.cost.total_api_duration_ms : null,
    ctxPct:        typeof r.context_window?.used_percentage === 'number' ? r.context_window.used_percentage : null,
    linesAdded:    typeof r.cost?.total_lines_added === 'number' ? r.cost.total_lines_added : null,
    linesRemoved:  typeof r.cost?.total_lines_removed === 'number' ? r.cost.total_lines_removed : null,
    outputStyle:   r.output_style?.name ?? null,
    // branch/dirty default here so render() never needs null guards;
    // pipeline overlays real git info before render is called.
    branch:        null,
    dirty:         false,
  };
}
