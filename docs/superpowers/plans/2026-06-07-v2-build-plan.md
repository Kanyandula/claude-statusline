# claude-statusline v2 — Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. This is a multi-phase rebuild plan; each phase below decomposes into tasks. Track with checkbox (`- [ ]`) syntax.

## Thesis

v2 is a ground-up simplification of v1, driven by two ideas:

1. **Architecture.** Collapse 28 files → 2 (`statusline.js`, `cli.js`), zero runtime deps, `node --test`. Derive everything derivable from the authoritative stdin payload instead of hardcoded tables. Write one test per *bug class*, not test-count-as-success.
2. **Render.** A redesigned bar where identity is plain text and *state is shape + color* — a spatial context bar, a health-pixel accent, fixed-width metric fields, and threshold-driven semantic color.

Non-goal: it is **not** a dashboard. Five well-chosen fields beat ten cluttered ones.

---

## Data contract (the authoritative source)

Claude Code pipes a JSON object to stdin on every render. v2 reads only from this payload (plus local `git`), never from a hardcoded model table.

Fields v2 consumes:

- `model.display_name` / `model.id` — identity; use `display_name` verbatim for the long label, trim `id` to a short name. **Do NOT map id → window size.** stdin already ships `context_window.context_window_size` (200000, or 1000000 for extended-context models) — read it directly. A hardcoded id→size table would violate this plan's own "derive from the authoritative source, never a hardcoded model table" principle.
- `context_window.context_window_size` — authoritative window size; the sole input to progressive-disclosure of the context-size label (no model table).
- `workspace.current_dir` (+ `project_dir`) — project name.
- `context_window.used_percentage` — drives the context bar (the headline metric).
- `context_window.total_input_tokens` / `total_output_tokens` — optional API-ratio field.
- `cost.total_cost_usd` — cost; plus `total_duration_ms`, `total_lines_added`, `total_lines_removed`. (Keys verified against the v2.1.132 docs 2026-06-07 — all correct; `total_api_duration_ms` also available for true API-wait time.)
- `output_style`, `session_id`, `cwd` — situational.

Available but not yet wired (verified present in stdin — weigh against the five-field budget rather than ignore):

- `rate_limits.five_hour.used_percentage` / `seven_day.used_percentage` — Pro/Max only, absent on API billing. Directly answers "am I about to be throttled" — arguably more actionable than burn-rate. Each window may be independently absent; guard with `// empty`.
- `context_window.remaining_percentage`, `exceeds_200k_tokens` — cheap secondary context signals.

Version caveat: `context_window.total_input_tokens` / `total_output_tokens` changed meaning at **v2.1.132** (current-context vs cumulative-session). Any optional API-ratio field built on them renders differently across CC versions — note the floor or drop it.

Known gaps — design around them, don't fake them:

- **plan mode / sandbox** are not in stdin (open issue `anthropics/claude-code#30189`). Any indicator would be permanently stale. Omit until exposed.
- **effort level** is not in stdin — only readable from `~/.claude/settings.json`. Treat as opt-in, settings-sourced, off by default.

All field access lives in **one adapter** (`readPayload(stdin) → ViewModel`). Schema drift becomes a one-line fix. This is the "derive from authoritative source" principle enforced structurally rather than promised in prose.

---

## Render pipeline

```
stdin → normalize → select layout → colorize (thresholds) → emit ANSI
```

- **normalize** — adapter produces a flat, typed view-model. Git info via a single local `git` call (`--show-current`, dirty flag, ahead/behind). No network.
- **layout** — pure function `(viewModel, config) → string[]`, one entry per line. No color, no I/O. Trivially testable.
- **colorize** — wraps fields in ANSI per threshold state. Isolated so golden tests can assert structure with color stripped *and* the escape codes with color on.
- **emit** — join and print. Nothing else writes to stdout.

Perf budget: the script runs on every render and every refresh tick, so it must stay local and fast — no network, no heavy spawns. Use `refreshInterval` (minimum 1s) only for the time/burn-rate fields so the clock advances while the session is idle.

---

## Layouts

**Ship `spatial` only in Phase A.** Four layout code paths re-import the v1
complexity this rebuild exists to shed and fight the locked "match structure
to scale" principle. The default bar must earn its place before alternatives
are coded.

- **`spatial`** (default, Phase A) — two lines.
  - Identity: `▌` health pixel · project · branch · model `[· ctx-size when non-default]`
  - State: `ctx ▰▰▰▱▱ NN%` · `⏱ 1h47m` · `$8.40` · `+342 / −89`
- **`compact`** / **`zen`** (Phase B, only if the default proves limiting) —
  same fields, one line / minimal. Prefer expressing these as config-data
  variations (separators, field on/off) over separate code paths.
- **`powerline`** (Phase C, opt-in) — requires a Nerd Font (arrows render as
  tofu otherwise). Gate behind config plus a capability note. Lowest priority.

---

## Design rules baked into the renderer

1. **Health-pixel accent.** `▌` color = the *worst* current threshold (context or cost). Peripheral-vision status with zero reading.
2. **Context as a bar, not a dot.** `used_percentage` → 10-cell fill. Pre-attentive "how full."
3. **Fixed-width metric fields.** Right-pad cost / pct / LOC so the line does not jitter as numbers change width. Stability beats compactness for something stared at constantly.
4. **Progressive disclosure.** Show `· 1M` / `· 200K` only when `context_window.context_window_size != 200000`; hide otherwise. Driven by the stdin field, not a per-model default table.
5. **Burn rate (opt-in).** `$8.40 ↑$4.7/h` from cost delta over duration — the actionable signal, not just the lagging total.
6. **Thresholds are config, color is derived.** green → yellow → red via one mapping function reused by every field and by the health pixel. Defaults: cost yellow `$5` / red `$20`; context yellow `60%` / red `85%`.

---

## Config

- Single resolved config object; precedence: defaults → user file (`~/.claude/statusline.json`) → env overrides.
- Schema:
  ```
  { layout, separators,
    thresholds: { cost, context },
    fields: { burnRate, apiRatio, outputStyle, gitAheadBehind },
    colors }
  ```
- Optional fields **off by default** (API ratio, output style, burn rate). The default bar stays at five fields.

---

## Testing — exercise the path that actually matters

The v1 failure mode this plan exists to prevent: tests that pass without rendering the real thing. v2's discipline:

- **Golden/snapshot tests pipe real stdin fixtures through the actual entry point** (`statusline.js < fixtures/*.json`) and assert the emitted line(s). This is the live path, not a mocked render.
- One fixture per bug class: missing/empty fields; `used_percentage` null; each threshold band (green/yellow/red boundaries); dirty + ahead/behind git; non-default context window; over-long project name (truncation); zero cost; every layout variant.
- Color asserted twice: structure with ANSI stripped, and the escape codes themselves at threshold transitions.
- **Risk #2 (carry-forward).** v1's security/edge tests must be *ported*, not silently dropped in the rewrite. Track them as a checklist. A green suite that lost coverage is a regression masquerading as a pass.

---

## Distribution

- **Location:** build v2 side-by-side at `~/claude-statusline-v2/`. v1 stays untouched at `~/claude-statusline` (existing tags + GitHub repo intact); archive v1 only after v2 has been stable for ≥1 day of real use.
- **MIT**, present from the first commit (Phase A).
- **npm is the primary install path.** Publish v2 under the existing `@kanyandula/claude-statusline` scope with a bumped **major** version (v2.0.0). README leads with `npm i -g @kanyandula/claude-statusline`.
- `install.sh` remains as the secondary / locked-down-environment path.
- Note v1's 2FA/OTP friction on publish (see `archive.md`) — plan the publish step around it (CI provenance / scoped token), don't let it block the release the way it did v1.

---

## Phasing

**Phase A — core + default layout**
- [ ] A1 adapter + view-model
- [ ] A2 `spatial` layout (pure function)
- [ ] A3 threshold → color + health pixel
- [ ] A4 golden tests on real fixtures
- [ ] A5 `install.sh` + `settings.json` wiring (init at `~/claude-statusline-v2/`)
- [ ] A6 MIT + README (npm-first headline, install.sh secondary)

**Phase B — layouts + economics**
- [ ] B1 `compact` / `zen` (config-data variations preferred over code paths; only if the default proves limiting). `powerline` deferred to Phase C.
- [ ] B2 burn-rate
- [ ] B3 git ahead/behind
- [ ] B4 progressive disclosure of context size
- [ ] B5 config file + precedence
- [ ] B6 npm publish v2.0.0 under `@kanyandula/claude-statusline` (plan around v1's 2FA/OTP friction — CI provenance / scoped token)

**Phase C — opt-in extras**
- [ ] C0 `powerline` layout (Nerd Font, capability-gated)
- [ ] C1 API output-token ratio
- [ ] C2 output-style glyph
- [ ] C3 effort level (settings-sourced, off by default)
- [ ] C4 OSC-8 clickable project → repo (capability-gated to iTerm2 / Kitty / WezTerm)

---

## Locked decisions

- 2 files, zero deps, `node --test`. No build step.
- All stdin access through one adapter.
- Window size comes from `context_window.context_window_size`; **no hardcoded model→size table**.
- Phase A ships `spatial` only; alternative layouts are later phases and prefer config-data over new code paths.
- Default layout = `spatial`; default = five fields; extras opt-in.
- Thresholds configurable; color always derived, never hand-set per field.
- Build side-by-side at `~/claude-statusline-v2`; v1 untouched until v2 is stable ≥1 day.
- npm primary: publish v2.0.0 under `@kanyandula/claude-statusline`; `install.sh` secondary; README leads with npm.
- Tests run the real entry point against fixtures; ported v1 coverage is a gate.

---

## Out of scope (v2)

Plan/sandbox indicators (not in stdin), network calls of any kind, a TUI/dashboard mode, per-turn token graphing, theme marketplace.

---

## References

- Claude Code statusLine docs — https://code.claude.com/docs/en/statusline
- stdin fields including `context_window.used_percentage`, `model.display_name`, `cost.total_cost_usd`
- Missing plan/sandbox fields — `anthropics/claude-code#30189`
