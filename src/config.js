import { readFileSync } from 'node:fs';

export const DEFAULT_CONFIG = {
  layout: 'two-line',
  fields: {
    project: true, branch: true, model: true,
    ctx: true, duration: true, cost: true, loc: true,
    apiRatio: false, outputStyle: false,
  },
  thresholds: {
    ctxWarnPct: 70, ctxDangerPct: 90,
    costWarnUsd: 5, costDangerUsd: 20,
  },
};

function readJsonSafe(path) {
  if (!path) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    const a = base?.[k];
    const b = over[k];
    if (a && typeof a === 'object' && !Array.isArray(a)
        && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = deepMerge(a, b);
    } else if (b !== undefined) {
      out[k] = b;
    }
  }
  return out;
}

export function loadConfig({ userPath, projectPath, env } = {}) {
  let cfg = {
    layout: DEFAULT_CONFIG.layout,
    fields: { ...DEFAULT_CONFIG.fields },
    thresholds: { ...DEFAULT_CONFIG.thresholds },
  };
  cfg = deepMerge(cfg, readJsonSafe(userPath));
  cfg = deepMerge(cfg, readJsonSafe(projectPath));
  // env overrides applied in Task 2; defaults + files only here
  return cfg;
}
