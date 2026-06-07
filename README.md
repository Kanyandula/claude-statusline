# claude-statusline v2

A fast, dependency-free status line for [Claude Code](https://claude.com/claude-code).
Identity is plain text; **state is shape and color** — a context bar, a
health-pixel accent, and threshold-driven semantic color, so you read your
session at a glance.

```
▌ claude-statusline · Opus
ctx ▰▱▱▱▱▱▱▱▱▱ 8%   · ⏱ 1h47m · $8.40   · +342 / −89
```

The leading `▌` takes the color of your **worst** active threshold (context or
cost), so peripheral vision alone tells you when something needs attention.

- **Two files, zero runtime dependencies.** `statusline.js` (renderer) and
  `cli.js` (install/uninstall). Node ≥ 18.
- **Derives everything from Claude Code's stdin** — no hardcoded model tables.
- **Null-tolerant** — a fresh session or a model without a field renders cleanly,
  never a crash or a stray `NaN`.

---

## Install

**Primary path — `install.sh`:**

```bash
curl -fsSL https://raw.githubusercontent.com/Kanyandula/claude-statusline/v2/install.sh | sh
```

This downloads the two files to `~/.claude/helpers/claude-statusline-v2/` and
wires the status line into `~/.claude/settings.json` for you (backing the file
up first, preserving your other settings, and forcing color on). Restart Claude
Code to see it.

Pass `--force` to overwrite an existing `statusLine` entry:

```bash
curl -fsSL https://raw.githubusercontent.com/Kanyandula/claude-statusline/v2/install.sh | sh -s -- --force
```

**From a clone:**

```bash
git clone -b v2 https://github.com/Kanyandula/claude-statusline.git
node claude-statusline/cli.js init
```

> **npm — coming soon.** v2 will publish to `@kanyandula/claude-statusline`
> once it has soaked. Until then, a bare `npm i -g @kanyandula/claude-statusline`
> still resolves to **v1**, so use `install.sh` above for v2.

### Uninstall

```bash
node ~/.claude/helpers/claude-statusline-v2/cli.js uninstall
```

Removes the `statusLine` entry (and backs the file up); your other settings are
left untouched.

---

## What it shows

| Field | Source | Notes |
|-------|--------|-------|
| `▌` health pixel | worst of context / cost | dim when there is no signal yet |
| project | `workspace.current_dir` | truncated if very long |
| branch | local `git` | overlaid by the pipeline (lands in a later phase) |
| model | `model.display_name` | verbatim |
| size label | `context_window.context_window_size` | shown only for non-default windows (e.g. `1M`) |
| `ctx` bar + % | `context_window.used_percentage` | 10-cell bar; `--%` on a fresh session |
| `⏱` duration | `cost.total_duration_ms` | auto-scaled (`45s` / `7m` / `1h47m`) |
| cost | `cost.total_cost_usd` | |
| LOC | `cost.total_lines_added` / `_removed` | |

### Color

One threshold mapping drives every colored field and the health pixel:

| Band | Context | Cost |
|------|---------|------|
| green | < 60% | < $5 |
| yellow | ≥ 60% | ≥ $5 |
| red | ≥ 85% | ≥ $20 |

Color is the escalation signal — identity stays plain so the colored fields
stand out. Honors `NO_COLOR` / `FORCE_COLOR`; the installed command passes
`--color` because Claude Code pipes our output (not a TTY) yet renders ANSI.

---

## How it works

Claude Code pipes a JSON object to the command on every render. `statusline.js`
reads **only** from that payload (plus a local `git` call), through a single
adapter — so a schema change is a one-line fix, never a scattered edit.

```
stdin → readPayload (adapter) → spatial layout → colorize (thresholds) → emit
```

See the [statusLine docs](https://code.claude.com/docs/en/statusline) for the
full stdin contract.

### On a large monorepo

The branch segment runs a single `git status` per update — and **only** when
Claude Code re-renders, never on an idle timer. On a big repo, turn on Git's own
accelerators so that stays fast:

```bash
git config core.fsmonitor true
git config core.untrackedCache true
```

claude-statusline *benefits* from these if you set them but never writes to your
repo config. If a `git status` ever exceeds ~1s it's dropped for that render —
the bar shows no branch rather than stalling.

---

## Development

```bash
node --test test.js     # golden tests pipe real stdin fixtures through the entry point
node statusline.js < fixtures/full.json                 # render once
FORCE_COLOR=1 node statusline.js < fixtures/full.json   # with color
```

Tests run the real entry point against fixtures — the live path, not a mocked
render.

---

## License

[MIT](LICENSE) © Ephraim Kanyandula
