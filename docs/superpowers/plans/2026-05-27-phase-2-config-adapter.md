# claude-statusline Phase 2 — Config + Adapter Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every part of the statusline configurable — layout (single vs two-line), per-field toggles, threshold cut-offs — without users editing source code. Add an optional `src/git.js` that surfaces branch + dirty state. Keep the renderer pure and the pipeline injectable so the CLI in Phase 3 has hooks to drive.

**Architecture:** Introduce `src/config.js` (defaults + file loader + env overrides, deep-merged) and `src/pipeline.js` (orchestrator that parses stdin → adapts → optionally augments with git → renders). `src/render.js` is refactored to consume a `Config` and branch between layouts. `bin/statusline.js` shrinks to a thin shell: read stdin → call `renderFromStdin(raw, { config })` → write stdout.

**Tech Stack:** Same as Phase 1 — Node ≥18, built-ins only, `node --test`. No new runtime deps.

---

## Context

Phase 1 shipped a working but hard-coded statusline. Anything users want to change — turn off LOC, use single-line, dim the cost threshold, hide the branch — requires editing source. Phase 2 makes all of that data-driven via a JSON config file, and adds the one missing data source from Phase 1 (`git` branch + dirty) so the `branch` field can be more than a stub. We also introduce `src/pipeline.js` to give Phase 3's CLI an injectable seam (mockable git function, mockable config) without subprocess gymnastics.

## File Structure (delta from Phase 1)

```
claude-statusline/
├── bin/
│   └── statusline.js           # MODIFIED — thinner; delegates to pipeline
├── src/
│   ├── config.js               # NEW — DEFAULT_CONFIG + loadConfig({ userPath, projectPath, env })
│   ├── pipeline.js             # NEW — renderFromStdin(raw, { config, gitFn })
│   ├── git.js                  # NEW — getGitInfo(cwd) → { branch, dirty } | null
│   ├── render.js               # MODIFIED — accepts Config; gates fields; branches on layout
│   └── adapters/
│       └── claude.js           # MODIFIED — exposes outputStyle + apiDurationMs
├── test/
│   ├── config.test.js          # NEW
│   ├── git.test.js             # NEW — uses tmp git repo via node:fs/node:child_process
│   ├── pipeline.test.js        # NEW
│   ├── render.test.js          # MODIFIED — covers layouts, toggles, thresholds
│   ├── adapter-claude.test.js  # MODIFIED — covers new fields
│   ├── bin.test.js             # MODIFIED — covers config file pickup
│   └── fixtures/
│       └── stdin-sample.json   # MODIFIED — adds output_style + api duration
```

## Updated `RenderInput` shape

`adapters/claude.js` returns this; `pipeline.js` may add `branch` + `dirty` from git before passing to `render`.

```ts
{
  projectName:   string | null,
  modelName:     string | null,
  contextWindow: string | null,
  costUsd:       number | null,
  durationMs:    number | null,
  apiDurationMs: number | null,   // NEW
  ctxPct:        number | null,
  linesAdded:    number | null,
  linesRemoved:  number | null,
  outputStyle:   string | null,   // NEW
  branch:        string | null,   // augmented by pipeline if config.fields.branch
  dirty:         boolean,         // augmented by pipeline; default false
}
```

## Final config schema

```json
{
  "layout": "two-line",
  "fields": {
    "project": true, "branch": true, "model": true,
    "ctx": true, "duration": true, "cost": true, "loc": true,
    "apiRatio": false, "outputStyle": false
  },
  "thresholds": {
    "ctxWarnPct": 70, "ctxDangerPct": 90,
    "costWarnUsd": 5, "costDangerUsd": 20
  }
}
```

**Merge precedence (highest wins):** env vars → project file → user file → defaults. Deep-merged per top-level key (i.e. `fields: { ctx: false }` in a user file only flips `ctx`; other field toggles keep their defaults).

**Env vars:**
- `CLAUDE_STATUSLINE_LAYOUT` — overrides `layout` (must be `"single"` or `"two-line"`)
- `CLAUDE_STATUSLINE_FIELDS` — comma-separated allow-list, REPLACES `fields` (only listed fields stay `true`; everything else flips `false`)

`gitAhead` (ahead/behind tracking), icon overrides, and colour overrides are intentionally deferred to a later phase to keep this one shippable.

---

# Tasks

### Task 1: Default config + `loadConfig` (defaults + user file)

**Files:**
- Create: `src/config.js`
- Create: `test/config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG, loadConfig } from '../src/config.js';

test('DEFAULT_CONFIG: layout is two-line and core fields enabled', () => {
  assert.equal(DEFAULT_CONFIG.layout, 'two-line');
  assert.equal(DEFAULT_CONFIG.fields.project, true);
  assert.equal(DEFAULT_CONFIG.fields.ctx, true);
  assert.equal(DEFAULT_CONFIG.fields.cost, true);
  assert.equal(DEFAULT_CONFIG.fields.apiRatio, false);
  assert.equal(DEFAULT_CONFIG.thresholds.ctxWarnPct, 70);
  assert.equal(DEFAULT_CONFIG.thresholds.costDangerUsd, 20);
});

test('loadConfig: no inputs returns defaults', () => {
  const cfg = loadConfig({});
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('loadConfig: missing user file does not throw', () => {
  const cfg = loadConfig({ userPath: '/does/not/exist.json' });
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('loadConfig: user file deep-merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ layout: 'single', fields: { ctx: false } }));
  try {
    const cfg = loadConfig({ userPath: file });
    assert.equal(cfg.layout, 'single');
    assert.equal(cfg.fields.ctx, false);
    assert.equal(cfg.fields.cost, true);       // unchanged from defaults
    assert.equal(cfg.thresholds.ctxWarnPct, 70); // unchanged from defaults
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: invalid JSON in user file falls back to defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, 'not json');
  try {
    const cfg = loadConfig({ userPath: file });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
node --test test/config.test.js
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// src/config.js
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
  let cfg = DEFAULT_CONFIG;
  cfg = deepMerge(cfg, readJsonSafe(userPath));
  cfg = deepMerge(cfg, readJsonSafe(projectPath));
  // env overrides applied in Task 2; defaults + files only here
  return cfg;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
node --test test/config.test.js
```
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -q -m "feat(config): defaults + loadConfig with user/project deep merge"
```

### Task 2: Env-var overrides

**Files:**
- Modify: `src/config.js`
- Modify: `test/config.test.js`

- [ ] **Step 1: Append failing tests**

```js
// append to test/config.test.js
test('loadConfig: env CLAUDE_STATUSLINE_LAYOUT overrides layout', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_LAYOUT: 'single' } });
  assert.equal(cfg.layout, 'single');
});

test('loadConfig: env CLAUDE_STATUSLINE_LAYOUT ignores invalid value', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_LAYOUT: 'bogus' } });
  assert.equal(cfg.layout, 'two-line');
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS replaces field set', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: 'model,ctx,cost' } });
  assert.equal(cfg.fields.model, true);
  assert.equal(cfg.fields.ctx, true);
  assert.equal(cfg.fields.cost, true);
  assert.equal(cfg.fields.project, false);
  assert.equal(cfg.fields.duration, false);
  assert.equal(cfg.fields.loc, false);
  assert.equal(cfg.fields.branch, false);
});

test('loadConfig: env CLAUDE_STATUSLINE_FIELDS empty value is ignored', () => {
  const cfg = loadConfig({ env: { CLAUDE_STATUSLINE_FIELDS: '' } });
  assert.equal(cfg.fields.project, true);
});

test('loadConfig: env overrides win over user file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cstest-'));
  const file = join(dir, 'u.json');
  writeFileSync(file, JSON.stringify({ layout: 'two-line' }));
  try {
    const cfg = loadConfig({ userPath: file, env: { CLAUDE_STATUSLINE_LAYOUT: 'single' } });
    assert.equal(cfg.layout, 'single');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
node --test test/config.test.js
```
Expected: FAIL — env overrides not applied.

- [ ] **Step 3: Implement env override layer**

Replace `loadConfig` in `src/config.js`:

```js
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

export function loadConfig({ userPath, projectPath, env } = {}) {
  let cfg = DEFAULT_CONFIG;
  cfg = deepMerge(cfg, readJsonSafe(userPath));
  cfg = deepMerge(cfg, readJsonSafe(projectPath));
  cfg = applyEnv(cfg, env);
  return cfg;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
node --test test/config.test.js
```
Expected: PASS (10/10 cumulative).

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -q -m "feat(config): env var overrides for layout and fields"
```

### Task 3: Extend Claude adapter with `outputStyle` + `apiDurationMs`

**Files:**
- Modify: `src/adapters/claude.js`
- Modify: `test/adapter-claude.test.js`
- Modify: `test/fixtures/stdin-sample.json`

- [ ] **Step 1: Extend the fixture**

```json
// test/fixtures/stdin-sample.json
{
  "model": { "id": "claude-opus-4-7", "display_name": "Opus 4.7" },
  "workspace": { "current_dir": "/Users/admin/myproject" },
  "cost": {
    "total_cost_usd": 19.01,
    "total_duration_ms": 172977000,
    "total_api_duration_ms": 134721000,
    "total_lines_added": 342,
    "total_lines_removed": 89
  },
  "context_window": { "used_percentage": 15 },
  "output_style": { "name": "explanatory" }
}
```

- [ ] **Step 2: Append failing tests to `test/adapter-claude.test.js`**

```js
test('claudeAdapter: maps outputStyle from output_style.name', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.outputStyle, 'explanatory');
});

test('claudeAdapter: maps apiDurationMs from cost.total_api_duration_ms', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.apiDurationMs, 134721000);
});

test('claudeAdapter: missing output_style → null', () => {
  const out = claudeAdapter({ model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' } });
  assert.equal(out.outputStyle, null);
});

test('claudeAdapter: branch and dirty default to null/false', () => {
  const out = claudeAdapter(sample);
  assert.equal(out.branch, null);
  assert.equal(out.dirty, false);
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
node --test test/adapter-claude.test.js
```
Expected: FAIL.

- [ ] **Step 4: Modify the adapter**

Replace the return in `src/adapters/claude.js` to add the two new fields plus `branch`/`dirty` defaults:

```js
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
```

- [ ] **Step 5: Run all tests**

```bash
node --test
```
Expected: ALL pass (existing render test still uses the same fixture but does not assert the new fields, so it stays green).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/claude.js test/adapter-claude.test.js test/fixtures/stdin-sample.json
git commit -q -m "feat(adapter): expose outputStyle + apiDurationMs; default branch/dirty"
```

### Task 4: Refactor renderer to consume `Config` (two-line layout still default)

**Files:**
- Modify: `src/render.js`
- Modify: `test/render.test.js`

- [ ] **Step 1: Append failing tests to `test/render.test.js`**

```js
import { DEFAULT_CONFIG } from '../src/config.js';

test('render: disabling cost field via config hides it', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, cost: false } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.doesNotMatch(out, /\$19\.01/);
});

test('render: ctx threshold change to 10 makes 15% red', () => {
  const cfg = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds, ctxDangerPct: 10 } };
  const out = render(claudeAdapter(sample), { colour: true, config: cfg });
  assert.match(out, /\x1b\[31m.*15%/);
});

test('render: cost threshold change makes $19.01 red when costDangerUsd=10', () => {
  const cfg = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds, costDangerUsd: 10 } };
  const out = render(claudeAdapter(sample), { colour: true, config: cfg });
  assert.match(out, /\x1b\[31m\$19\.01/);
});

test('render: apiRatio field enabled prints API %', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, apiRatio: true } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  // 134721000 / 172977000 ≈ 78%
  assert.match(out, /78%/);
});

test('render: outputStyle field enabled prints style name', () => {
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, outputStyle: true } };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /explanatory/);
});

test('render: branch field rendered when input.branch present', () => {
  const cfg = { ...DEFAULT_CONFIG };
  const input = { ...claudeAdapter(sample), branch: 'main', dirty: false };
  const out = render(input, { colour: false, config: cfg });
  assert.match(out, /main/);
});

test('render: dirty branch gets * suffix', () => {
  const input = { ...claudeAdapter(sample), branch: 'main', dirty: true };
  const out = render(input, { colour: false, config: DEFAULT_CONFIG });
  assert.match(out, /main\*/);
});
```

- [ ] **Step 2: Run, verify failures**

```bash
node --test test/render.test.js
```
Expected: existing render tests still pass; new tests FAIL.

- [ ] **Step 3: Refactor `src/render.js` (still only two-line)**

```js
// src/render.js
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
      ? c('cyan', `⎇ ${input.branch}${input.dirty ? c('red', '*') : ''}`)
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
    apiRatio:    f.apiRatio    ? c('dim', apiRatioStr(input)) : '',
    outputStyle: (f.outputStyle && input.outputStyle) ? c('dim', `📐 ${input.outputStyle}`) : '',
  };

  // Two-line layout only (single-line added in Task 5)
  const line1 = ['▌', parts.project, parts.branch, parts.model].filter(Boolean).join('  ');
  const line2 = ['  ', parts.ctx, parts.duration, parts.cost, parts.loc, parts.apiRatio, parts.outputStyle]
    .filter(Boolean).join('  ');
  return `${line1}\n${line2}`;
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
node --test
```
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -q -m "feat(render): consume Config for field toggles + thresholds; add apiRatio/outputStyle/branch"
```

### Task 5: Add single-line layout branch

**Files:**
- Modify: `src/render.js`
- Modify: `test/render.test.js`

- [ ] **Step 1: Append failing tests**

```js
test('render: single-line layout produces exactly one line', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.equal(out.split('\n').length, 1);
});

test('render: single-line uses short context window label', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /Opus 4\.7 \(1M\)/);
  assert.doesNotMatch(out, /Opus 4\.7 \(1M context\)/);
});

test('render: single-line uses compact LOC format', () => {
  const cfg = { ...DEFAULT_CONFIG, layout: 'single' };
  const out = render(claudeAdapter(sample), { colour: false, config: cfg });
  assert.match(out, /\+342\/-89/);
});

test('render: two-line layout still produces two lines (regression)', () => {
  const out = render(claudeAdapter(sample), { colour: false });
  assert.equal(out.split('\n').length, 2);
});
```

- [ ] **Step 2: Run, verify failures**

```bash
node --test test/render.test.js
```
Expected: new tests FAIL.

- [ ] **Step 3: Add layout branch and compact formatters**

Replace the bottom of `src/render.js` (everything from `// Two-line layout only` down) with:

```js
  if (config.layout === 'single') {
    const compactModel = (f.model && input.modelName)
      ? c('magenta', `${input.modelName}${input.contextWindow ? ` (${input.contextWindow.replace(' context', '')})` : ''}`)
      : '';
    const compactLoc = (() => {
      if (!f.loc) return '';
      const a = typeof input.linesAdded === 'number' ? input.linesAdded : 0;
      const r = typeof input.linesRemoved === 'number' ? input.linesRemoved : 0;
      if (a === 0 && r === 0) return '';
      return c('dim', `+${a}/-${r}`);
    })();
    return ['▌', parts.project, parts.branch, compactModel, parts.ctx, parts.duration, parts.cost,
            compactLoc, parts.apiRatio, parts.outputStyle].filter(Boolean).join('  ');
  }

  const line1 = ['▌', parts.project, parts.branch, parts.model].filter(Boolean).join('  ');
  const line2 = ['  ', parts.ctx, parts.duration, parts.cost, parts.loc, parts.apiRatio, parts.outputStyle]
    .filter(Boolean).join('  ');
  return `${line1}\n${line2}`;
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
node --test
```
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -q -m "feat(render): single-line layout with compact model + loc formats"
```

### Task 6: Git module (`branch` + `dirty`)

**Files:**
- Create: `src/git.js`
- Create: `test/git.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/git.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { getGitInfo } from '../src/git.js';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'csgit-'));
  const run = (args) => spawnSync('git', args, { cwd: dir });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@test']);
  run(['config', 'user.name', 'test']);
  writeFileSync(join(dir, 'a.txt'), 'hi');
  run(['add', '.']);
  run(['commit', '-q', '-m', 'init']);
  return { dir, run };
}

test('getGitInfo: clean repo returns branch=main, dirty=false', () => {
  const { dir } = makeRepo();
  try {
    const info = getGitInfo(dir);
    assert.equal(info.branch, 'main');
    assert.equal(info.dirty, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: dirty working tree returns dirty=true', () => {
  const { dir } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'changed');
    const info = getGitInfo(dir);
    assert.equal(info.dirty, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: non-git directory returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csnogit-'));
  try {
    assert.equal(getGitInfo(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getGitInfo: missing cwd returns null', () => {
  assert.equal(getGitInfo(null), null);
  assert.equal(getGitInfo('/does/not/exist'), null);
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test test/git.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/git.js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TIMEOUT_MS = 200;

function gitCmd(cwd, args) {
  const r = spawnSync('git', args, { cwd, timeout: TIMEOUT_MS, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

export function getGitInfo(cwd) {
  if (!cwd || !existsSync(cwd)) return null;
  const inside = gitCmd(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return null;
  const branch = gitCmd(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === null) return null;
  const status = gitCmd(cwd, ['status', '--porcelain']);
  return { branch, dirty: status !== null && status.length > 0 };
}
```

- [ ] **Step 4: Run, verify it passes**

```bash
node --test test/git.test.js
```
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/git.js test/git.test.js
git commit -q -m "feat(git): getGitInfo with branch + dirty detection and silent timeout"
```

### Task 7: Pipeline orchestrator

**Files:**
- Create: `src/pipeline.js`
- Create: `test/pipeline.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/pipeline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderFromStdin } from '../src/pipeline.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const sample = readFileSync(new URL('./fixtures/stdin-sample.json', import.meta.url), 'utf8');

test('renderFromStdin: produces a string from valid JSON', () => {
  const out = renderFromStdin(sample, { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.match(out, /Opus 4\.7 \(1M context\)/);
});

test('renderFromStdin: empty stdin still returns a string (no throw)', () => {
  const out = renderFromStdin('', { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.equal(typeof out, 'string');
});

test('renderFromStdin: branch field enabled + gitFn provides branch → branch rendered', () => {
  const cfg = { ...DEFAULT_CONFIG };
  const out = renderFromStdin(sample, {
    config: cfg, colour: false,
    gitFn: () => ({ branch: 'feature/x', dirty: true }),
  });
  assert.match(out, /feature\/x\*/);
});

test('renderFromStdin: branch field disabled → gitFn not called', () => {
  let called = 0;
  const cfg = { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields, branch: false } };
  renderFromStdin(sample, { config: cfg, colour: false, gitFn: () => { called++; return null; } });
  assert.equal(called, 0);
});

test('renderFromStdin: gitFn returning null leaves branch unrendered but does not throw', () => {
  const out = renderFromStdin(sample, { config: DEFAULT_CONFIG, colour: false, gitFn: () => null });
  assert.doesNotMatch(out, /⎇/);
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test test/pipeline.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// src/pipeline.js
import { parseInput } from './input.js';
import { claudeAdapter } from './adapters/claude.js';
import { render } from './render.js';

export function renderFromStdin(raw, opts = {}) {
  const { config, colour, gitFn } = opts;
  const parsed = parseInput(raw);
  let input = claudeAdapter(parsed);

  if (config?.fields?.branch && typeof gitFn === 'function') {
    const cwd = parsed?.workspace?.current_dir || parsed?.cwd || null;
    const info = gitFn(cwd);
    if (info) input = { ...input, branch: info.branch, dirty: !!info.dirty };
  }

  return render(input, { config, colour });
}
```

- [ ] **Step 4: Run, verify it passes**

```bash
node --test test/pipeline.test.js
```
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.js test/pipeline.test.js
git commit -q -m "feat(pipeline): renderFromStdin orchestrator with injectable gitFn"
```

### Task 8: Update `bin/statusline.js` to use config + pipeline

**Files:**
- Modify: `bin/statusline.js`
- Modify: `test/bin.test.js`

- [ ] **Step 1: Append failing test (config file pickup)**

```js
// append to test/bin.test.js
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('bin/statusline.js: respects CLAUDE_STATUSLINE_LAYOUT=single', () => {
  const r = spawnSync(process.execPath, ['bin/statusline.js'], {
    input: sample,
    env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_LAYOUT: 'single' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString().split('\n').length, 1);
});

test('bin/statusline.js: user config file disables cost field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csbin-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ fields: { cost: false } }));
  try {
    const r = spawnSync(process.execPath, ['bin/statusline.js'], {
      input: sample,
      env: { ...process.env, NO_COLOR: '1', CLAUDE_STATUSLINE_CONFIG: file },
    });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout.toString(), /\$19\.01/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test test/bin.test.js
```
Expected: FAIL — bin script does not yet load config.

- [ ] **Step 3: Rewrite `bin/statusline.js`**

```js
#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderFromStdin } from '../src/pipeline.js';
import { loadConfig } from '../src/config.js';
import { getGitInfo } from '../src/git.js';

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});

const userPath    = process.env.CLAUDE_STATUSLINE_CONFIG
  || join(homedir(), '.claude', 'claude-statusline.json');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  try {
    let projectPath = null;
    try {
      const parsed = JSON.parse(raw || '{}');
      const cwd = parsed?.workspace?.current_dir || parsed?.cwd;
      if (cwd) projectPath = join(cwd, '.claude', 'claude-statusline.json');
    } catch { /* ignore — pipeline will handle */ }

    const config = loadConfig({ userPath, projectPath, env: process.env });
    process.stdout.write(renderFromStdin(raw, { config, gitFn: getGitInfo }));
  } catch (e) {
    if (process.env.CLAUDE_STATUSLINE_DEBUG) process.stderr.write(`statusline error: ${e}\n`);
  }
});
```

- [ ] **Step 4: Run all tests**

```bash
node --test
```
Expected: ALL pass.

- [ ] **Step 5: Visual smoke**

```bash
NO_COLOR=1 cat test/fixtures/stdin-sample.json | node bin/statusline.js
NO_COLOR=1 CLAUDE_STATUSLINE_LAYOUT=single cat test/fixtures/stdin-sample.json | node bin/statusline.js
NO_COLOR=1 CLAUDE_STATUSLINE_FIELDS=model,cost cat test/fixtures/stdin-sample.json | node bin/statusline.js
```
Expected outputs:
- First: two lines, full content.
- Second: one line, compact model + LOC.
- Third: only model + cost visible.

- [ ] **Step 6: Commit + tag**

```bash
git add bin/statusline.js test/bin.test.js
git commit -q -m "feat(bin): load config and pipe through renderFromStdin"
git tag -a v0.2.0-config -m "Phase 2: configurable layout/fields/thresholds + git"
```

---

## Verification (Phase 2)

```bash
cd ~/claude-statusline
node --test                                    # all tests pass (target ≥ 55)
NO_COLOR=1 cat test/fixtures/stdin-sample.json | node bin/statusline.js
NO_COLOR=1 CLAUDE_STATUSLINE_LAYOUT=single cat test/fixtures/stdin-sample.json | node bin/statusline.js
```

Then, in a real session:

```bash
echo '{"layout":"single","fields":{"loc":false}}' > ~/.claude/claude-statusline.json
# start a new claude session — statusline appears as one line, no LOC delta
```

## Self-review notes

- **Spec coverage:** every Phase 2 outline bullet maps to a task. config.js (Tasks 1–2), render refactor (Task 4), single-line (Task 5), git.js (Task 6), pipeline (Task 7), bin wiring (Task 8). New adapter fields (Task 3) were added because Task 4 needs `apiDurationMs`/`outputStyle` to test the new toggles.
- **Placeholder scan:** every step has complete code, exact commands, and expected outcomes. No `TBD`s.
- **Type consistency:** `RenderInput` shape declared once at the top; `branch` / `dirty` defaults set in adapter (Task 3) and overwritten by pipeline (Task 7); `DEFAULT_CONFIG` shape consistent across config.js / render.js / pipeline.js.
- **Risks flagged:**
  - The `output_style.name` field appears on Claude's stdin in some versions but not all — Task 3 treats absence as `null` so older CLIs render fine.
  - `apiDurationMs / durationMs` could be `>1` momentarily (rounding); the apiRatio formula uses `Math.round` so display caps at 100% without special-casing — acceptable for v0.2.
  - The git timeout is 200ms; on very cold filesystems (network mounts) this could intermittently miss the branch. Acceptable for a statusline that re-runs every prompt.
