import { basename } from 'node:path';
import { contextWindowLabel } from '../models.js';

export function claudeAdapter(raw) {
  const r = raw || {};
  const cwd = r.workspace?.current_dir || r.cwd || null;
  const modelId = r.model?.id || null;
  return {
    projectName:   cwd ? basename(cwd) : null,
    modelName:     r.model?.display_name ?? null,
    contextWindow: modelId ? contextWindowLabel(modelId) : null,
    costUsd:       typeof r.cost?.total_cost_usd === 'number' ? r.cost.total_cost_usd : null,
    durationMs:    typeof r.cost?.total_duration_ms === 'number' ? r.cost.total_duration_ms : null,
    apiDurationMs: typeof r.cost?.total_api_duration_ms === 'number' ? r.cost.total_api_duration_ms : null,
    ctxPct:        typeof r.context_window?.used_percentage === 'number' ? r.context_window.used_percentage : null,
    linesAdded:    typeof r.cost?.total_lines_added === 'number' ? r.cost.total_lines_added : null,
    linesRemoved:  typeof r.cost?.total_lines_removed === 'number' ? r.cost.total_lines_removed : null,
    outputStyle:   r.output_style?.name ?? null,
    branch:        null,
    dirty:         false,
  };
}
