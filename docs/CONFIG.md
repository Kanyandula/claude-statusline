# Configuration Reference

Full reference for every config knob, env var, and threshold accepted by
`claude-statusline`. The CLI does not auto-generate this — treat this file
as authoritative.

---

## 1. Where config lives

| File | Purpose |
|---|---|
| `~/.claude/claude-statusline.json` | User-level defaults (all projects) |
| `<cwd>/.claude/claude-statusline.json` | Project-level overrides |

Set `$CLAUDE_STATUSLINE_CONFIG` to an absolute `.json` path to replace the
user-level file with a custom location (see [Env-var overrides](#6-env-var-overrides)).

**Precedence (highest wins):**

1. Env vars
2. Project file (`<cwd>/.claude/claude-statusline.json`)
3. User file (`~/.claude/claude-statusline.json`)
4. Built-in defaults

Missing files and invalid JSON are silently ignored — built-in defaults apply
in their place. The two JSON files are **deep-merged**: nested objects merge
key-by-key, so a project file that sets only `fields.cost` leaves every other
`fields` entry (and all of `thresholds`) from the user file or defaults
untouched. After merging, the result is normalized to the schema — see
[Validation rules](#8-validation-rules).

---

## 2. Top-level keys

Three keys are recognised at the top level. Unknown keys at any level are
ignored.

```json
{
  "layout": "two-line",
  "fields": {
    "project": true,
    "branch": true,
    "model": true,
    "ctx": true,
    "duration": true,
    "cost": true,
    "loc": true,
    "apiRatio": false,
    "outputStyle": false
  },
  "thresholds": {
    "ctxWarnPct": 70,
    "ctxDangerPct": 90,
    "costWarnUsd": 5,
    "costDangerUsd": 20
  }
}
```

---

## 3. `layout`

**Type:** `"single"` | `"two-line"`  
**Default:** `"two-line"`

Controls how many output rows are rendered.

| Layout | What it looks like |
|---|---|
| `two-line` | Two rows: identity row (project / branch / model) above metrics row (ctx / duration / cost / LOC) |
| `single` | One row, compact — model label drops `" context"` (e.g. `1M` not `1M context`), `+N/-M` LOC with no spaces, all fields on one line |

Any other value is silently ignored and the default `"two-line"` is used when
read from a config file. Setting it via `CLAUDE_STATUSLINE_LAYOUT` to an
unrecognised value is also silently ignored.

---

## 4. `fields`

Enable or disable individual statusline fields. Each key is a **boolean**;
`true` = shown, `false` = hidden.

| Name | Type | Default | Source data | What it shows |
|---|---|---|---|---|
| `project` | boolean | `true` | `workspace.current_dir` (basename) | Project directory name |
| `branch` | boolean | `true` | single `git status --porcelain=v2 --branch` in cwd | Branch name (`(detached)` when detached); appends `*` when working tree is dirty |
| `model` | boolean | `true` | `model.display_name` (parsed) | Model name + context-window size (e.g. `Opus 4.7 (1M context)`) |
| `ctx` | boolean | `true` | `context_window.used_percentage` | `● N% ctx` — colour-coded by threshold |
| `duration` | boolean | `true` | `cost.total_duration_ms` | Session wall time; auto-scales to `Xs`, `XmYs`, or `XhYm` |
| `cost` | boolean | `true` | `cost.total_cost_usd` | Session cost in USD; colour-coded by threshold |
| `loc` | boolean | `true` | `cost.total_lines_added` / `total_lines_removed` | `+N / -M` lines changed (`+N/-M` compact in `single` layout) |
| `apiRatio` | boolean | `false` | `total_api_duration_ms / total_duration_ms` | `🌐 N%` — fraction of wall time spent waiting on API |
| `outputStyle` | boolean | `false` | `output_style.name` | `📐 <name>` — name of the active output style |

Fields disabled by default (`apiRatio`, `outputStyle`) add visual noise for
most users; opt in by setting them to `true` in your config or via
`CLAUDE_STATUSLINE_FIELDS`.

---

## 5. `thresholds`

Numeric tunables that control when `ctx` and `cost` fields change colour.

| Name | Type | Default | What triggers |
|---|---|---|---|
| `ctxWarnPct` | number | `70` | Context % ≥ this value → **yellow** |
| `ctxDangerPct` | number | `90` | Context % ≥ this value → **red** (overrides warn) |
| `costWarnUsd` | number | `5` | Cost ≥ this value (USD) → **yellow** |
| `costDangerUsd` | number | `20` | Cost ≥ this value (USD) → **red** (overrides warn) |

**Colour bands:**

- `ctx`: green below `ctxWarnPct`, yellow at/above `ctxWarnPct`, red at/above
  `ctxDangerPct`.
- `cost`: uncoloured below `costWarnUsd`, yellow at/above `costWarnUsd`, red
  at/above `costDangerUsd`.

`ctxDangerPct` must be greater than `ctxWarnPct`; likewise for the cost pair.
The CLI does not validate the ordering — if you set danger below warn, the
danger colour will never appear.

---

## 6. Env-var overrides

All env vars are read from `process.env`. None are required.

| Env var | What it does |
|---|---|
| `CLAUDE_STATUSLINE_CONFIG` | Absolute path (must end in `.json`) used as the user config file. Replaces `~/.claude/claude-statusline.json`. The same constraint applies to writes: `set`, `reset`, and `uninstall` refuse a path that is not an absolute `.json`. |
| `CLAUDE_STATUSLINE_LAYOUT` | `single` or `two-line`. Any other value is silently ignored. |
| `CLAUDE_STATUSLINE_FIELDS` | Comma-separated allow-list of field names (e.g. `project,branch,ctx`). **Replace semantics** — only the listed fields are enabled; all others are hidden. An empty string is ignored. |
| `CLAUDE_STATUSLINE_LIVE_PATH` | File path polled by `preview --live`. Default: `/tmp/claude-stdin.json`. |
| `NO_COLOR` | Any non-empty value disables all ANSI colour output. |
| `FORCE_COLOR` | Any non-empty value forces ANSI colour output even when stdout is not a TTY. |
| `CLAUDE_STATUSLINE_DEBUG` | Any non-empty value enables internal error logging to stderr. Without it, errors are silent and defaults apply. |

`NO_COLOR` and `FORCE_COLOR` follow the [no-color.org](https://no-color.org/)
convention. When both are set, `FORCE_COLOR` wins.

**Example — enable only project and ctx, compact layout:**

```bash
CLAUDE_STATUSLINE_LAYOUT=single CLAUDE_STATUSLINE_FIELDS=project,ctx claude-statusline get
```

---

## 7. Schema example (annotated)

The JSON below shows common customisations with inline comments.

> **Note:** JSON does not support `//` comments. Strip the comment lines before
> saving this as a real config file — a parser will reject them otherwise.

```json
{
  // Compact one-row layout
  "layout": "single",

  // Turn off LOC delta (saves horizontal space)
  // and enable API time ratio
  "fields": {
    "loc": false,
    "apiRatio": true
  },

  // Stricter cost warnings — yellow at $1, red at $5
  "thresholds": {
    "costWarnUsd": 1,
    "costDangerUsd": 5
  }
}
```

The same config, pasteable as valid JSON:

```json
{
  "layout": "single",
  "fields": {
    "loc": false,
    "apiRatio": true
  },
  "thresholds": {
    "costWarnUsd": 1,
    "costDangerUsd": 5
  }
}
```

Fields not mentioned in a partial config object inherit from the layer below
in the precedence chain (user file → defaults). You do not need to list every
field to change one.

---

## 8. Validation rules

What the CLI accepts and rejects:

### `layout`

- Accepted values: `"single"`, `"two-line"`.
- In a config file: unrecognised values are silently ignored; the default
  `"two-line"` applies.
- Via `CLAUDE_STATUSLINE_LAYOUT` env var: same — unrecognised values ignored.
- Via `claude-statusline set layout <value>`: the CLI rejects unknown values
  with an error message listing valid options.

### `fields.<name>`

- Must be one of the 9 known field names (`project`, `branch`, `model`, `ctx`,
  `duration`, `cost`, `loc`, `apiRatio`, `outputStyle`).
- `claude-statusline enable <name>` and `claude-statusline disable <name>` reject unknown field names
  with an error.
- In a config file: unknown field names are silently ignored (forward-compat).
- `CLAUDE_STATUSLINE_FIELDS`: unknown names in the comma-separated list are
  silently dropped.

### `thresholds.<name>`

- Must be a number (integer or float).
- `claude-statusline set thresholds.<name> <value>`: rejects non-numeric strings with an
  error.
- In a config file: non-numeric values are silently ignored; the built-in
  default for that threshold applies.

### Config file reads

- A missing config file is silently ignored; built-in defaults apply.
- A file containing invalid JSON is treated as missing — silently ignored,
  built-in defaults apply. Use `CLAUDE_STATUSLINE_DEBUG=1` to surface parse
  errors to stderr.

### Config file writes (`set` / `reset` / `uninstall`)

- Writes and deletes go only to an absolute `.json` path. A
  `CLAUDE_STATUSLINE_CONFIG` that is relative or lacks a `.json` extension is
  refused with a clear error — the same allowlist that guards reads — so a
  stray env var can never cause an arbitrary file to be overwritten or deleted.

### settings.json corruption

`claude-statusline` never writes to Claude's own `settings.json`. If that file
is unreadable or malformed, the CLI throws a clear error rather than silently
defaulting, because corrupt agent settings affect more than just the statusline.
