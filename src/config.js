import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

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

// Defence against CLAUDE_STATUSLINE_CONFIG (or any other caller) pointing the
// loader at arbitrary files like /etc/passwd or ~/.ssh/* whose accidental
// JSON-shaped content could leak into our config. Require:
//   - string path
//   - absolute (no relative-path surprises from cwd-switching)
//   - .json extension (narrows the surface to files explicitly typed as config)
export function isAllowedConfigPath(p) {
  return typeof p === 'string' && p.length > 0 && isAbsolute(p) && /\.json$/i.test(p);
}

function readJsonSafe(path) {
  if (!isAllowedConfigPath(path)) return null;
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

function applyEnv(cfg, env) {
  if (!env || typeof env !== 'object') return cfg;
  let out = cfg;

  const layout = env.CLAUDE_STATUSLINE_LAYOUT;
  if (layout === 'single' || layout === 'two-line') {
    out = { ...out, layout };
  }

  const fieldsCsv = env.CLAUDE_STATUSLINE_FIELDS;
  if (typeof fieldsCsv === 'string' && fieldsCsv.trim()) {
    const allowed = new Set(fieldsCsv.split(',').map(s => s.trim()).filter(Boolean));
    const nextFields = {};
    for (const k of Object.keys(out.fields)) nextFields[k] = allowed.has(k);
    out = { ...out, fields: nextFields };
  }

  return out;
}

export const KNOWN_FIELDS = Object.keys(DEFAULT_CONFIG.fields);
export const LAYOUTS = ['single', 'two-line'];
export const KNOWN_THRESHOLDS = Object.keys(DEFAULT_CONFIG.thresholds);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Clamp a merged config to the known schema before it reaches the renderer.
// Hand-edited config files bypass the `set` command's validation, so shapes
// like {"fields": null} (→ render dereferences null → blank statusline) or
// {"thresholds": {"ctxWarnPct": "high"}} (→ NaN comparisons silently disable
// the colour tiers) can otherwise slip through. Rebuild from defaults, taking
// only correctly-typed values, and drop unknown keys so `get` stays schema-true.
function normalizeConfig(cfg) {
  const src = isPlainObject(cfg) ? cfg : {};

  const layout = LAYOUTS.includes(src.layout) ? src.layout : DEFAULT_CONFIG.layout;

  const srcFields = isPlainObject(src.fields) ? src.fields : {};
  const fields = {};
  for (const k of KNOWN_FIELDS) {
    fields[k] = typeof srcFields[k] === 'boolean' ? srcFields[k] : DEFAULT_CONFIG.fields[k];
  }

  const srcThresholds = isPlainObject(src.thresholds) ? src.thresholds : {};
  const thresholds = {};
  for (const k of KNOWN_THRESHOLDS) {
    const v = srcThresholds[k];
    thresholds[k] = (typeof v === 'number' && Number.isFinite(v)) ? v : DEFAULT_CONFIG.thresholds[k];
  }

  return { layout, fields, thresholds };
}

export function loadConfig({ userPath, projectPath, env } = {}) {
  let cfg = {
    layout: DEFAULT_CONFIG.layout,
    fields: { ...DEFAULT_CONFIG.fields },
    thresholds: { ...DEFAULT_CONFIG.thresholds },
  };
  cfg = deepMerge(cfg, readJsonSafe(userPath));
  cfg = deepMerge(cfg, readJsonSafe(projectPath));
  cfg = applyEnv(cfg, env);
  return normalizeConfig(cfg);
}
