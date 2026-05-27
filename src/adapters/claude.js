import { basename } from 'node:path';
import { contextWindowLabel, contextWindowShortLabel } from '../models.js';

// Claude's `model.display_name` may already include a trailing context-window
// label like "Opus 4.7 (1M context)". Split it so the renderer can pick the
// right form per layout without doubling up.
function splitDisplayName(displayName, modelId) {
  if (!displayName) return { base: null, long: null, short: null };
  const m = displayName.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) {
    const base = m[1];
    const long = m[2];
    const short = long.replace(/\s*context\s*$/i, '');
    return { base, long, short };
  }
  // No parens in display_name — fall back to model-id lookup
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
