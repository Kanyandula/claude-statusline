# Configuration Reference

Full reference for every config key, env var, and threshold accepted by
`claude-statusline` v2. This file is hand-maintained — treat it as
authoritative, and check it against `statusline.js` if anything looks off.

---

## 1. Where config lives

v2 reads a **single** JSON file:

| File | Purpose |
|---|---|
| `~/.claude/statusline.json` | All configuration |

Set `$CLAUDE_STATUSLINE_CONFIG` to an absolute `*.json` path to read that file
instead of `~/.claude/statusline.json` (see [Env-var overrides](#8-env-var-overrides)).

There is **no project-level config file** in v2. Change settings either with
the `config` command or by editing the JSON directly:

```bash
claude-statusline config list                 # current values + valid options
claude-statusline config get theme            # print one effective value
claude-statusline config set theme vivid       # write one key (validated)
claude-statusline config set thresholds.cost.warn 2   # nested keys use dots
```

`config set` validates against the same schema the loader uses (an invalid
value or unknown key is rejected with the valid options, and nothing is
written), writes only the keys you set (the rest stay defaulted), and **takes
effect on the next render — no restart needed**, since the renderer re-reads
the file every render. It also warns if the key you set is currently shadowed
by an env var (precedence below). A missing or malformed file is silently
ignored and built-in defaults apply, so a typo can never blank the bar.

> The other two commands, `init` and `uninstall`, wire the script into
> `~/.claude/settings.json` — that file *is* read once at startup, so those
> two do require a Claude Code restart.

**Precedence (highest wins):**

1. Env vars (only `CLAUDE_STATUSLINE_LAYOUT` overrides a config value)
2. The config file
3. Built-in defaults

The file is deep-merged onto the defaults (nested objects merge key-by-key),
then normalized to the schema — wrong-typed values fall back to their default
and unknown keys are dropped. See [Validation rules](#7-validation-rules).

---

## 2. Full schema (all defaults shown)

```json
{
  "layout": "spatial",
  "theme": "minimal",
  "colorDepth": "auto",
  "separators": "·",
  "defaultWindowSize": 200000,
  "maxProjectWidth": 24,
  "thresholds": {
    "context": { "warn": 60, "danger": 85 },
    "cost":    { "warn": 5,  "danger": 20 }
  },
  "fields": {
    "burnRate": false,
    "gitAheadBehind": true
  }
}
```

You only need to list the keys you want to change; everything omitted inherits
the default above.

---

## 3. Layout, theme, and color

### `layout`

**Type:** `"spatial"` | `"compact"` | `"zen"` | `"powerline"`
**Default:** `"spatial"`

| Layout | What it looks like |
|---|---|
| `spatial` | Two lines: identity row (project / branch / model) above a metrics row (ctx / duration / cost / LOC) |
| `compact` | The same fields, on one line |
| `zen` | One line, `project · model · ctx% · cost` — color is the only escalation signal |
| `powerline` | One line of background-filled segments joined by the powerline arrow. **Needs a Nerd Font**, or the arrow glyphs render as tofu (`▯`). Uses a fixed truecolor palette — it bypasses `theme`. |

Unrecognised values fall back to `spatial`.

### `theme`

**Type:** `"minimal"` | `"vivid"`
**Default:** `"minimal"`

| Theme | What it does |
|---|---|
| `minimal` | Your terminal's ANSI palette. Identity (project/branch/model) stays plain; only context, cost, and the health pixel take threshold color. |
| `vivid` | The design-mock palette — truecolor hex, colored identity, LOC split green (added) / red (removed), and a calm purple health pixel that turns red only in the danger band. |

Unrecognised values fall back to `minimal`. The `powerline` layout ignores
`theme` entirely (it has its own palette).

### `colorDepth`

**Type:** `"auto"` | `"truecolor"` | `"256"`
**Default:** `"auto"`

`vivid` and `powerline` emit truecolor (24-bit) hex; on a terminal without
truecolor those colors break.

- `auto` — truecolor everywhere **except Apple Terminal** (`TERM_PROGRAM=Apple_Terminal`,
  which has no truecolor), where it downsamples to xterm-256 so the bar still
  renders.
- `truecolor` — force full 24-bit color.
- `256` — force the xterm-256 fallback.

Unrecognised values fall back to `auto`.

---

## 4. Spacing and labels

### `separators`

**Type:** string (non-empty)
**Default:** `"·"`

The glyph used to join fields on a line in `spatial`, `compact`, and `zen`
(rendered with a space on each side: ` · `). An empty string is ignored and the
default applies. `powerline` ignores this — it joins segments with its arrow
glyph.

### `defaultWindowSize`

**Type:** number
**Default:** `200000`

The context-window size the bar assumes is "normal." The model's window size is
shown as a separate segment **only when it differs** from this value (so a 1M
session stands out, while an ordinary 200k session stays uncluttered). Set this
to your usual window size to suppress the segment, or to a sentinel like `0` to
always show it.

### `maxProjectWidth`

**Type:** number (positive; truncated to an integer)
**Default:** `24`

Maximum width of the project-name segment; longer names are truncated. A
non-positive or non-numeric value falls back to `24`.

---

## 5. Thresholds

Control when the `context` and `cost` fields (and the health pixel) change
color. Each band has a `warn` and a `danger` value.

```json
"thresholds": {
  "context": { "warn": 60, "danger": 85 },
  "cost":    { "warn": 5,  "danger": 20 }
}
```

| Band | `warn` default | `danger` default | Units |
|---|---|---|---|
| `context` | `60` | `85` | percent of context window used |
| `cost` | `5` | `20` | USD, session total |

**Color bands:**

- `context`: green below `warn`, yellow at/above `warn`, red at/above `danger`.
- `cost`: uncolored below `warn`, yellow at/above `warn`, red at/above `danger`.

The leading `▌` health pixel takes the color of your **worst** active band.

> **Ordering is not validated.** `danger` should be greater than `warn`; if you
> set `danger` below `warn`, the danger color never appears. Each value is taken
> independently — a non-numeric `warn` or `danger` falls back to its own default,
> not the whole band.

---

## 6. `fields`

Toggle optional segments. Each key is a **boolean**.

| Name | Default | What it shows |
|---|---|---|
| `gitAheadBehind` | `true` | Appends `↑N` / `↓M` commit counts to the branch segment (ahead/behind upstream). Set `false` to show just the branch name (and `*` when dirty). |
| `burnRate` | `false` | Appends a session-average burn rate (e.g. `↑$4.7/h`) after cost. Computed as `total_cost_usd / wall-clock hours`; suppressed on the first tick when duration is 0. It is an **average**, not a current rate. |

> **Reserved (not yet rendered).** The loader also accepts `apiRatio`,
> `outputStyle`, and `rateLimits` so configs stay forward-compatible, but **no
> layout renders them in this release** — setting them has no visible effect.
> They are slated for a later (Phase C) version.

The identity and metric segments themselves (project, branch, model, ctx,
duration, cost, LOC) are **not individually toggleable** in v2 — choose a
`layout` to control which appear. Unknown field names in the file are dropped.

---

## 7. Validation rules

What the loader accepts and rejects, per the normalizer in `statusline.js`:

- **Missing / unreadable / invalid-JSON / non-object file** → silently ignored;
  built-in defaults apply.
- **`layout`, `theme`, `colorDepth`** → must be one of their known values, else
  the default for that key.
- **`separators`** → must be a non-empty string, else `"·"`.
- **`defaultWindowSize`** → must be a finite number, else `200000`.
- **`maxProjectWidth`** → must be a finite number `> 0` (floored to an integer),
  else `24`.
- **`thresholds.<band>.<warn|danger>`** → must be a finite number, else that
  field's own default. Ordering (`danger > warn`) is **not** enforced.
- **`fields.<name>`** → must be a boolean, else the default for that field.
  Unknown field names are dropped.
- **Unknown top-level keys** → dropped.
- **Config path allowlist** → a `CLAUDE_STATUSLINE_CONFIG` that is not an
  absolute path ending in `.json` is refused (the loader falls back to the
  default file), guarding against a stray env var pointing the reader at, e.g.,
  a relative file or `/etc/passwd`.

---

## 8. Env-var overrides

All env vars are read from `process.env`. None are required.

| Env var | What it does |
|---|---|
| `CLAUDE_STATUSLINE_CONFIG` | Absolute `*.json` path read in place of `~/.claude/statusline.json`. A relative path or non-`.json` extension is refused (defaults apply). |
| `CLAUDE_STATUSLINE_LAYOUT` | `spatial` / `compact` / `zen` / `powerline`. Overrides the file's `layout`. Any other value is ignored. |
| `NO_COLOR` | Any non-empty value disables all ANSI color. **Takes precedence over `FORCE_COLOR`** (checked first). |
| `FORCE_COLOR` | Any non-empty value forces ANSI color even when stdout is not a TTY. |
| `TERM_PROGRAM` | When set to `Apple_Terminal` and `colorDepth` is `auto`, output downsamples to xterm-256. |

`NO_COLOR` / `FORCE_COLOR` follow the [no-color.org](https://no-color.org/)
convention, except that here **`NO_COLOR` wins** when both are set.

**Color flags.** The command `init` installs passes `--color`, because Claude
Code pipes the output (not a TTY) yet renders ANSI. Run directly, `--color` /
`--no-color` flags override env and TTY detection; otherwise color follows
`NO_COLOR` → `FORCE_COLOR` → stdout-is-a-TTY.

> Note: v1's `CLAUDE_STATUSLINE_FIELDS`, `CLAUDE_STATUSLINE_LIVE_PATH`, and
> `CLAUDE_STATUSLINE_DEBUG` env vars **do not exist in v2**.

---

## 9. Example configs

**Vivid theme on a one-line layout, forced truecolor:**

```json
{
  "layout": "compact",
  "theme": "vivid",
  "colorDepth": "truecolor"
}
```

**Powerline (needs a Nerd Font), with burn rate and stricter cost warnings:**

```json
{
  "layout": "powerline",
  "fields": { "burnRate": true },
  "thresholds": { "cost": { "warn": 1, "danger": 5 } }
}
```

**Zen layout, no ahead/behind counts, custom separator:**

```json
{
  "layout": "zen",
  "separators": "•",
  "fields": { "gitAheadBehind": false }
}
```

Apply any of these with `claude-statusline config set <key> <value>`, or write
the JSON to `~/.claude/statusline.json` directly. Either way it takes effect on
the next render — no restart needed.
