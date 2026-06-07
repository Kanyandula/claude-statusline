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

- `model.display_name` / `model.id` — identity; use `display_name` verbatim for the long label, trim `id` to a short name. **Do NOT map id → window size.** stdin already ships `context_window.context_window_size` — read it directly. A hardcoded id→size table would violate this plan's own "derive from the authoritative source, never a hardcoded model table" principle.
- `context_window.context_window_size` — authoritative window size (200000, or 1000000 for extended-context models); sole input to progressive-disclosure of the context-size label. **Null-tolerant:** absent (older CC) ⇒ treat as default ⇒ label hidden, no crash. The "default" it is compared against is config (`defaultWindowSize`, default 200000), never a literal buried in the render path.
- `workspace.current_dir` (+ `project_dir`) — project name.
- `context_window.used_percentage` — drives the context bar (the headline metric). Null-tolerant — see render-fallback below.
- `context_window.total_input_tokens` / `total_output_tokens` — optional API-ratio field.
- `cost.total_cost_usd` — cost; plus `total_duration_ms`, `total_lines_added`, `total_lines_removed`. (Keys verified against the v2.1.132 docs 2026-06-07 — all correct; `total_api_duration_ms` also available for true API-wait time.)
- `output_style`, `session_id`, `cwd` — situational.

Available but not yet wired (verified present in stdin — weigh against the five-field budget rather than ignore):

- `rate_limits.five_hour.used_percentage` / `seven_day.used_percentage` — **Pro/Max only, absent on API billing** (including the LiteLLM-proxy work setup, where it will never populate). A genuinely good "am I about to be throttled" signal for personal Pro/Max sessions, but it **does not displace cost/burn-rate** — those stay the always-available economic field. Wired as a Phase C opt-in, **off by default**, self-suppressing when the window is absent (`// empty` guard — never render an empty/stale limit). Flip it on per-machine via the config file.
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

- **normalize** — adapter produces a flat, typed view-model. Git info via a **single** call: `git -c core.fsmonitor= -c core.hooksPath=/dev/null status --porcelain=v2 --branch` (no network) — the `-c` flags carry forward v1's perf hardening (skip the fsmonitor handshake and any repo hooks). Branch from `# branch.head`, upstream from `# branch.upstream` (absent ⇒ no upstream), ahead/behind from `# branch.ab +A -B` (absent ⇒ empty), dirty = any non-`#` line present. Wrap in try/catch so a non-git dir degrades to no git segment rather than an error. (Untracked-file scanning is the costly part of `git status`; `--untracked-files=no` is an available perf lever but changes dirty-semantics — see OD-1.)
- **layout** — pure function `(viewModel, config) → string[]`, one entry per line. No color, no I/O. Trivially testable.
- **colorize** — wraps fields in ANSI per threshold state. Isolated so golden tests can assert structure with color stripped *and* the escape codes with color on.
- **emit** — join and print. Nothing else writes to stdout.

Perf budget: the script runs on every render and every refresh tick, so it must stay local and fast — no network, no heavy spawns (one `git` invocation max). Use `refreshInterval` (minimum 1s) only for the time/burn-rate fields so the clock advances while the session is idle. Note OD-1: `refreshInterval` re-runs the *whole* script — including that git call — on every tick, not just on message events.

---

## Open decisions

- **OD-1 — `refreshInterval` vs. per-render `git status` (perf).** Enabling `refreshInterval` for the idle clock (rule 5 / burn-rate) re-runs the whole script — including the `git status` call — on every timer tick, not just on message events. The statusLine docs explicitly flag `git status` as the slow path in large repos and recommend caching git state to a `session_id`-keyed temp file refreshed every ~5s. That collides with this plan's stdout-only / no-state-file rule (currently waived only for a hypothetical rolling burn-rate). The `-c core.fsmonitor=` / `--untracked-files=no` flags (see normalize) cut the cost but don't eliminate it. **Decide before B3/B5:** (a) keep the call cheap and accept a full `git status` per tick, (b) adopt the docs' `session_id` git cache and relax the no-state-file rule for git, or (c) gate the git segment behind a coarser interval than the clock. **Unresolved.**

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

1. **Health-pixel accent.** `▌` color = the *worst* current threshold (context or cost). Peripheral-vision status with zero reading. Fields with no signal (null `used_percentage`, suppressed cost) are excluded from the calc, so the pixel never flashes red on a fresh session.
2. **Context as a bar, not a dot.** `used_percentage` → 10-cell fill. Pre-attentive "how full." **Null fallback:** a fresh session (null `used_percentage`) renders a fixed-width placeholder `ctx ▱▱▱▱▱▱▱▱▱▱ --%` in neutral/dim and is excluded from rule 1.
3. **Fixed-width metric fields.** Right-pad cost / pct / LOC so the line does not jitter as numbers change width. Stability beats compactness for something stared at constantly.
4. **Progressive disclosure.** Show `· 1M` / `· 200K` only when `context_window_size` is present **and** `!= config.defaultWindowSize` (default 200000); absent or equal ⇒ hidden. Driven by the stdin field and a config sentinel — not a per-model default table, not a buried literal.
5. **Burn rate (opt-in, off by default).** Session-average `$/h = total_cost_usd / (total_duration_ms / 3_600_000)` — **wall-clock denominator** (`total_duration_ms`, not `total_api_duration_ms`; idle time is still spend). Suppress the field when `total_duration_ms` is 0 (first tick). Stateless by definition and **labeled as an average**. A rolling / "current" rate is out of scope for v2 — it needs a `session_id`-keyed state file (a named exception to the stdout-only rule), deferred to Phase C if ever.
6. **Thresholds are config, color is derived.** green → yellow → red via one mapping function reused by every field and by the health pixel. Defaults: cost yellow `$5` / red `$20`; context yellow `60%` / red `85%`.

---

## Config

- Single resolved config object; precedence: defaults → user file (`~/.claude/statusline.json`) → env overrides.
- Schema:
  ```
  { layout, separators,
    defaultWindowSize: 200000,
    thresholds: { cost, context },
    fields: { burnRate, apiRatio, outputStyle, gitAheadBehind, rateLimits },
    colors }
  ```
- Optional fields **off by default** (API ratio, output style, burn rate, rate limits). The default bar stays at five fields.
- `burnRate` and `rateLimits` additionally self-suppress when their source data is absent or zero, so enabling them never produces an empty or stale slot.

---

## Testing — exercise the path that actually matters

The v1 failure mode this plan exists to prevent: tests that pass without rendering the real thing. v2's discipline:

- **Golden/snapshot tests pipe real stdin fixtures through the actual entry point** (`statusline.js < fixtures/*.json`) and assert the emitted line(s). This is the live path, not a mocked render.
- **Phase A golden set is `spatial` only**, across the bug classes: missing/empty fields; `used_percentage` null; context boundaries 59/60/84/85; cost boundaries $4.99/$5/$19.99/$20; dirty + ahead/behind git; no-upstream branch; non-default (1M) window; over-long project name (truncation); zero cost / zero duration. Variant fixtures are added as each layout lands in B/C — coverage tracks code, never promises layouts that don't exist yet.
- Color asserted twice: structure with ANSI stripped, and the escape codes themselves at threshold transitions.
- **Risk #2 (carry-forward).** v1's security/edge tests must be *ported*, not silently dropped in the rewrite. Track them as a checklist. A green suite that lost coverage is a regression masquerading as a pass.

---

## Distribution

- **Location:** build v2 side-by-side at `~/claude-statusline-v2/`. v1 stays untouched at `~/claude-statusline` (existing tags + GitHub repo intact); archive v1 only after v2 has soaked (see below).
- **MIT**, present from the first commit (Phase A).
- **Publish path (npm primary), engineered around v1's 2FA/OTP friction:** stand up an automated publish before B6 — npm **trusted publishing** (OIDC from a GitHub Actions release workflow, which also emits provenance for free) or a granular automation token as fallback. B6 then publishes `2.0.0` to the existing `@kanyandula/claude-statusline` scope **on the `next` dist-tag** (`npm publish --tag next`), *not* `latest`. So `npm i -g @kanyandula/claude-statusline` keeps resolving to v1 for everyone until you've soaked v2 for ≥1 day of real use, after which you promote with `npm dist-tag add @kanyandula/claude-statusline@2.0.0 latest`. This gives a real registry-side soak, not just a local-directory one, and turns the OTP wall into a solved CI step rather than a release blocker.
- **README sequencing:** A6 ships the README **install.sh-first**. The npm-first headline (`npm i -g @kanyandula/claude-statusline`) flips **at promotion (B6c), in the same commit that runs `npm dist-tag add … latest`** — *not* at the B6b publish. Rationale: while v2 sits on the `next` tag, the bare `npm i -g @kanyandula/claude-statusline` still resolves to v1 (`latest`); a headline flipped at B6b would *silently install v1 while describing v2* — worse than a 404 because it's silent. During the soak, README stays install.sh-first, or advertises an explicit `@next` line (`npm i -g @kanyandula/claude-statusline@next`) for early adopters. Net: no window where the headline 404s **or** silently installs the wrong version.
- `install.sh` remains the secondary / locked-down-environment path.

---

## Phasing

**Phase A — core + default layout**
- [ ] A1 adapter + view-model (null-tolerant: `context_window_size`, `used_percentage`)
- [ ] A2 `spatial` layout (pure function)
- [ ] A3 threshold → color + health pixel (no-signal fields excluded)
- [ ] A4 golden tests on real fixtures (`spatial` only — see Testing)
- [ ] A5 `install.sh` + `settings.json` wiring (init at `~/claude-statusline-v2/`)
- [ ] A6 MIT + README (**install.sh-first headline; npm flip deferred to B6c**)

**Phase B — layouts + economics**
- [ ] B1 `compact` / `zen` (config-data variations preferred over code paths; only if the default proves limiting). `powerline` deferred to Phase C.
- [ ] B2 burn-rate (session-average `$/h`, wall-clock denominator, opt-in/off, self-suppressing)
- [ ] B3 git ahead/behind (already free from the single `git status --porcelain=v2 --branch` call) — resolve OD-1 first
- [ ] B4 progressive disclosure of context size (`context_window_size != defaultWindowSize`)
- [ ] B5 config file + precedence (incl. `defaultWindowSize`, `rateLimits`) — resolve OD-1 first
- [ ] B6 npm publish under `@kanyandula/claude-statusline`:
  - [ ] B6a trusted-publishing release workflow (OIDC + provenance) — or granular automation token
  - [ ] B6b publish `2.0.0` to `--tag next` (README stays install.sh-first / advertise `@next` — do **NOT** flip the headline yet)
  - [ ] B6c soak ≥1 day of real use, then promote `next` → `latest` (`npm dist-tag add … latest`) **and** flip README to npm-first headline in the same commit; archive v1 afterward

**Phase C — opt-in extras**
- [ ] C0 `powerline` layout (Nerd Font, capability-gated)
- [ ] C1 API output-token ratio (note the v2.1.132 semantics floor, or drop)
- [ ] C2 output-style glyph
- [ ] C3 effort level (settings-sourced, off by default)
- [ ] C4 `rate_limits` field (Pro/Max only, off by default, self-suppressing on API/proxy billing)
- [ ] C5 OSC-8 clickable project → repo (capability-gated to iTerm2 / Kitty / WezTerm)

---

## Locked decisions

- 2 files, zero deps, `node --test`. No build step.
- All stdin access through one adapter; null-tolerant on `context_window_size` and `used_percentage`.
- Window size comes from `context_window.context_window_size`; **no hardcoded model→size table**. Progressive-disclosure sentinel is config `defaultWindowSize` (default 200000), not a literal.
- Git state from a **single** `git -c core.fsmonitor= -c core.hooksPath=/dev/null status --porcelain=v2 --branch` call (v1 perf flags carried forward), try/catch-guarded. Per-tick git cost under `refreshInterval` is **OD-1 (open)**.
- Phase A ships `spatial` only; alternative layouts are later phases and prefer config-data over new code paths.
- Default layout = `spatial`; default = five fields; extras opt-in. Burn-rate and rate_limits are opt-in, off by default, and self-suppress when source data is absent.
- Burn-rate is **session-average** `$/h`, stateless, wall-clock denominator; a rolling rate is out of scope (Phase C + state file if ever).
- Null `used_percentage` → neutral fixed-width placeholder, excluded from the worst-threshold calc.
- Thresholds configurable; color always derived, never hand-set per field.
- Build side-by-side at `~/claude-statusline-v2`; v1 untouched until v2 is promoted to `latest`.
- **npm primary via trusted publishing:** publish `2.0.0` to `--tag next`, soak ≥1 day, promote to `latest`. README headline flips to npm-first **at promotion (B6c), not at the B6b publish** — during soak the bare install resolves to v1, so the headline stays install.sh-first / `@next`. No window where the headline 404s **or** silently installs the wrong version. `install.sh` secondary.
- Tests run the real entry point against fixtures; ported v1 coverage is a gate.

---

## Out of scope (v2)

Plan/sandbox indicators (not in stdin), network calls of any kind, a TUI/dashboard mode, per-turn token graphing, theme marketplace, rolling/"current" burn-rate (requires a state file — Phase C at the earliest).

---

## References

- Claude Code statusLine docs — https://code.claude.com/docs/en/statusline
- stdin fields including `context_window.used_percentage`, `context_window.context_window_size`, `model.display_name`, `cost.total_cost_usd`
- Missing plan/sandbox fields — `anthropics/claude-code#30189`
