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

- `model.display_name` / `model.id` — identity; use `display_name` for the long label (but **strip a trailing "(… context)"** — real CC sends "Opus 4.8 (1M context)", and the derived size label already shows the window, so verbatim use doubles it: "… (1M context) · 1M". Corrected 2026-06-08 from live data; the original "verbatim" assumption was wrong). Trim `id` to a short name. **Do NOT map id → window size.** stdin already ships `context_window.context_window_size` — read it directly. A hardcoded id→size table would violate this plan's own "derive from the authoritative source, never a hardcoded model table" principle.
- `context_window.context_window_size` — authoritative window size (200000, or 1000000 for extended-context models); sole input to progressive-disclosure of the context-size label. **Null-tolerant:** absent (older CC) ⇒ treat as default ⇒ label hidden, no crash. The "default" it is compared against is config (`defaultWindowSize`, default 200000), never a literal buried in the render path.
- `workspace.current_dir` (+ `project_dir`) — project name.
- `context_window.used_percentage` — drives the context bar (the headline metric). Null-tolerant — see render-fallback below.
- `context_window.total_input_tokens` / `total_output_tokens` — optional API-ratio field.
- `cost.total_cost_usd` — cost; plus `total_duration_ms`, `total_lines_added`, `total_lines_removed`. (Keys verified against the v2.1.132 docs 2026-06-07 — all correct; `total_api_duration_ms` also available for true API-wait time.)
- `output_style`, `session_id`, `cwd` — situational.

Available but not yet wired (verified present in stdin — weigh against the five-field budget rather than ignore):

- `rate_limits.five_hour.used_percentage` / `seven_day.used_percentage` — **Pro/Max only, absent on API billing** (including the LiteLLM-proxy work setup, where it will never populate). A genuinely good "am I about to be throttled" signal for personal Pro/Max sessions, but it **does not displace cost/burn-rate** — those stay the always-available economic field. Wired as a Phase C opt-in, **off by default**, self-suppressing when the window is absent (`// empty` guard — never render an empty/stale limit). Flip it on per-machine via the config file.
- `context_window.remaining_percentage`, `exceeds_200k_tokens` — cheap secondary context signals.
- `effort.level` — **documented stdin field** (`low`/`medium`/`high`/`xhigh`/`max`; ultracode reports as `xhigh`). Live value, reflects mid-session `/effort` changes. Absent when the current model doesn't support the effort parameter ⇒ self-suppressing. No `settings.json` read needed. Wired as a Phase C opt-in (C3), off by default. `thinking.enabled` and `vim.mode` are likewise present but lower-value.
  - **Not version-gated.** The docs version-mark fields that need it (`total_input_tokens` → 2.1.132, `COLUMNS/LINES` → 2.1.153) but place **no** floor on `effort.level` — its only absence condition is by-model, not by-version. So C3 needs *self-suppression* (like `rate_limits`), not a version guard. Dev box is CC 2.1.168. **Still pending: an empirical raw-payload dump** to confirm the live shape before C3 lands — deferred until the bar is wired into a real session (the optional dogfood) or C3 is implemented.

Version caveat: `context_window.total_input_tokens` / `total_output_tokens` changed meaning at **v2.1.132** (current-context vs cumulative-session). Any optional API-ratio field built on them renders differently across CC versions — note the floor or drop it.

Known gaps — design around them, don't fake them:

- **plan mode / sandbox** are not in stdin (open issue `anthropics/claude-code#30189`). Any indicator would be permanently stale. Omit until exposed.
- (**effort level** was previously listed here as a gap — it is **not** a gap. `effort.level` is a documented stdin field; see "available but not yet wired" above. Corrected 2026-06-07 against the live statusLine docs.)

All field access lives in **one adapter** (`readPayload(stdin) → ViewModel`). Schema drift becomes a one-line fix. This is the "derive from authoritative source" principle enforced structurally rather than promised in prose.

---

## Render pipeline

```
stdin → normalize → select layout → colorize (thresholds) → emit ANSI
```

- **normalize** — adapter produces a flat, typed view-model. Git info via a **single** call: `git status --porcelain=v2 --branch` (no network), **time-bounded (~1s) and try/catch-guarded** so a non-git dir, a hung index lock, or a pathological large-repo status degrades to *no git segment* rather than hanging or erroring the bar. Branch from `# branch.head`, upstream from `# branch.upstream` (absent ⇒ no upstream), ahead/behind from `# branch.ab +A -B` (absent ⇒ empty), dirty = any non-`#` line present. **Do not pass `-c core.fsmonitor=`** — that *disables* fsmonitor and slows status on the very monorepos that need it (corrects an earlier finding). Run plain so the user's `core.fsmonitor` / `core.untrackedCache` accelerate us if set; recommend enabling them to monorepo users in the README, but never write to their repo config.
- **layout** — pure function `(viewModel, config) → string[]`, one entry per line. No color, no I/O. Trivially testable.
- **colorize** — wraps fields in ANSI per threshold state. Isolated so golden tests can assert structure with color stripped *and* the escape codes with color on.
- **emit** — join and print. Nothing else writes to stdout.

Perf budget: the script runs on every render and every refresh tick, so it must stay local and fast — no network, no heavy spawns (one `git` invocation max, ~1s-bounded). **Default config sets NO `refreshInterval`** (see OD-1 resolution): git runs only on Claude Code's event-updates — which is exactly when git state can change — so there is no idle git storm and no state file. `refreshInterval` + a git cache is a documented opt-in for users who want an idle-advancing clock.

---

## Open decisions

- **OD-1 — `refreshInterval` vs. per-render `git status` — RESOLVED 2026-06-07 (Option 1).** Default config sets **no `refreshInterval`**, so git runs only on Claude Code's event-updates. Rationale: git state changes only *as a consequence of events* (a tool ran, a commit landed), and CC fires an event-update at exactly those moments — so event cadence is coincident with the only times git can differ, not a compromise against a timer. Re-running `git status` on an idle timer recomputes the same answer repeatedly (wasted work, and a per-tick storm on a monorepo like Atlas/sxm-android). The only thing that advances while idle is wall-clock time, and a glance-bar clock being a few seconds stale while unobserved is irrelevant (burn-rate is already opt-in/off and session-average).
  - **The state file is not abandoned — it's scoped.** Default = no state file, event cadence, monorepo-safe. The `session_id`-keyed git cache (docs' pattern) is the *correct implementation* of the opt-in path: a statusline script re-runs wholesale and can't refresh just the clock, so the only way to add `refreshInterval` without re-shelling git is to cache git. So Option 1 *contains* Option 2 — Option 1 is the default, Option 2 is the documented mechanism that appears only when a user enables `refreshInterval`. Keeps the no-state-file rule pure by default; the cache is a named, scoped exception tied to an explicit opt-in (consistent with rolling burn-rate).
  - **B3 robustness add-ons (both stateless):** (1) bound the git call with a ~1s timeout → degrade to no-git-segment via the existing try/catch; (2) benefit from the user's `core.fsmonitor`/`core.untrackedCache` if set, document them as a monorepo recommendation, but never write to the user's repo config. Do **not** pass `-c core.fsmonitor=` (it disables the speedup).

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
- [ ] B3 git overlay: branch + dirty + ahead/behind from a single ~1s-bounded `git status --porcelain=v2 --branch` (plain, no fsmonitor override); try/catch → no-git-segment. OD-1 resolved (Option 1).
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
- [ ] C3 effort level — stdin `effort.level` (low/medium/high/xhigh/max; ultracode→xhigh), self-suppressing when absent; off by default. (No `settings.json` read — corrected from the original settings-sourced assumption.)
- [ ] C4 `rate_limits` field (Pro/Max only, off by default, self-suppressing on API/proxy billing)
- [ ] C5 OSC-8 clickable project → repo (capability-gated to iTerm2 / Kitty / WezTerm)

---

## Locked decisions

- 2 files, zero deps, `node --test`. No build step.
- All stdin access through one adapter; null-tolerant on `context_window_size` and `used_percentage`.
- Window size comes from `context_window.context_window_size`; **no hardcoded model→size table**. Progressive-disclosure sentinel is config `defaultWindowSize` (default 200000), not a literal.
- Git state from a **single, ~1s-bounded** `git status --porcelain=v2 --branch` call, try/catch-guarded → no-git-segment on failure/timeout. Run **plain** (no `-c core.fsmonitor=` — that disables the monorepo speedup); benefit from the user's fsmonitor/untrackedCache if set, recommend them in docs, never write repo config. **OD-1 resolved (Option 1):** default sets no `refreshInterval` (git on event-updates only, no state file); `refreshInterval` + a `session_id` git cache is the documented opt-in.
- Phase A ships `spatial` only; alternative layouts are later phases and prefer config-data over new code paths.
- Default layout = `spatial`; default = five fields; extras opt-in. Burn-rate and rate_limits are opt-in, off by default, and self-suppress when source data is absent.
- Burn-rate is **session-average** `$/h`, stateless, wall-clock denominator; a rolling rate is out of scope (Phase C + state file if ever).
- Null `used_percentage` → neutral fixed-width placeholder, excluded from the worst-threshold calc.
- Thresholds configurable; color always derived, never hand-set per field.
- Build side-by-side at `~/claude-statusline-v2`; v1 untouched until v2 is promoted to `latest`.
- **npm primary via trusted publishing:** publish `2.0.0` to `--tag next`, soak ≥1 day, promote to `latest`. README headline flips to npm-first **at promotion (B6c), not at the B6b publish** — during soak the bare install resolves to v1, so the headline stays install.sh-first / `@next`. No window where the headline 404s **or** silently installs the wrong version. `install.sh` secondary.
- Tests run the real entry point against fixtures; ported v1 coverage is a gate.

---

## Themes (the deferred `colors` key, realized 2026-06-08)

The plan's `colors` config key landed as named **themes** (color still derived,
never hand-set per field — consistent with the locked rule):

- `minimal` (default) — the original thesis: identity plain, only ctx/cost/pixel
  threshold-colored, terminal ANSI palette.
- `vivid` — the original design-mock palette (`claude_statusline_design_directions.html`):
  truecolor hex, colored identity (pink project, blue model, dim branch/duration),
  split green/red LOC, and a calm purple pixel that turns red only in the danger
  band. Needs a truecolor terminal. Opt-in via `theme: "vivid"`.

**Cross-terminal color (2026-06-08):** `vivid`/`powerline` are truecolor; added a
`colorDepth` config field (`auto`|`truecolor`|`256`). `auto` keeps truecolor
everywhere except **Apple Terminal** (reliable `TERM_PROGRAM=Apple_Terminal` ID
— COLORTERM is unreliable there), where it downsamples each hex to xterm-256 so
the bar renders consistently instead of breaking. Env-detect lives only at the
entry (`main`); pure `colorize`/`wrap` default to truecolor and take an explicit
depth, keeping unit tests deterministic. (Font is the orthogonal lever — the
powerline `` arrows still need a Nerd Font; 256 fixes color, not glyphs.)

Mock-direction coverage: **A spatial** ✅, **B burn-rate** ✅ (opt-in field, not a
separate layout), **D zen** ✅, **C powerline** ✅ (2026-06-08 — `layout:
"powerline"`, truecolor background segments + arrow glyphs, Nerd-Font-gated,
distinct render path from the painter). `vivid` reproduces the mock palette for
A/B/D. **All four mock directions are now covered.**

## Out of scope (v2)

Plan/sandbox indicators (not in stdin), network calls of any kind, a TUI/dashboard mode, per-turn token graphing, theme marketplace, rolling/"current" burn-rate (requires a state file — Phase C at the earliest).

---

## References

- Claude Code statusLine docs — https://code.claude.com/docs/en/statusline
- stdin fields including `context_window.used_percentage`, `context_window.context_window_size`, `model.display_name`, `cost.total_cost_usd`
- Missing plan/sandbox fields — `anthropics/claude-code#30189`
