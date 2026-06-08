# Examples

Recipe gallery for common `claude-statusline` v2 setups. v2 is configured with
a **single JSON file** at `~/.claude/statusline.json` — there is no `set` /
`enable` / `layout` CLI (that was v1). Each recipe below is the JSON to drop in
that file, with a sample of the resulting bar.

Sample outputs are shown **plain** (no ANSI color), since color can't render in
a code block — the structure is what changes between recipes; color is layered
on top per the thresholds. See [CONFIG.md](CONFIG.md) for the full key
reference.

> **Iterate locally without restarting Claude Code.** Pipe a saved payload
> through the script and force color on:
> ```bash
> FORCE_COLOR=1 node statusline.js < fixtures/full.json
> ```
> Edit `~/.claude/statusline.json`, re-run, repeat. Restart Claude Code once
> you're happy with it.

---

### 1. Default (spatial)

No config file needed — this is what you get out of the box: two lines,
identity above metrics, `minimal` theme (identity plain, color only on context
/ cost / the `▌` health pixel).

```json
{}
```

Sample output:

```
▌ claude-statusline · Opus
ctx ▰▱▱▱▱▱▱▱▱▱ 8%   · ⏱ 1h47m · $8.40   · +342 / −89
```

The model's context-window size is only shown when it differs from
`defaultWindowSize` (200k) — so an ordinary session omits it, and a 1M session
shows `· 1M`.

---

### 2. Compact one-liner

Same fields, collapsed onto a single line for narrow terminals or a thin
status bar.

```json
{
  "layout": "compact"
}
```

Sample output:

```
▌ claude-statusline · Opus · ctx ▰▱▱▱▱▱▱▱▱▱ 8%   · ⏱ 1h47m · $8.40   · +342 / −89
```

---

### 3. Zen

The shortest layout: `project · model · ctx% · cost`. No bar, no duration, no
LOC — color is the only escalation signal, so the line stays calm until context
or cost crosses a threshold.

```json
{
  "layout": "zen"
}
```

Sample output:

```
▌ claude-statusline · Opus · 8% · $8.40
```

---

### 4. Vivid theme

The design-mock palette: truecolor, colored identity, LOC split green (added) /
red (removed), and a purple health pixel that turns red only in the danger
band. The structure is unchanged from the default — the difference is entirely
color, so force it on to see it.

```json
{
  "theme": "vivid",
  "colorDepth": "truecolor"
}
```

On Apple Terminal (no truecolor), drop `colorDepth` and the default `auto`
downsamples to xterm-256 so the colors still render — set `truecolor`
explicitly only on a terminal you know supports it.

---

### 5. Powerline (needs a Nerd Font)

One line of background-filled segments joined by the powerline arrow ``. This
layout **requires a Nerd Font** for the arrow and branch glyphs — without one
they render as tofu (`▯`). It uses its own truecolor palette and ignores
`theme`.

```json
{
  "layout": "powerline"
}
```

Powerline only looks right with color **and** a Nerd Font in your terminal;
with color stripped it degrades to a plain field list, so there's no
representative plain sample to show here — try it live with
`FORCE_COLOR=1 node statusline.js < fixtures/full.json`.

---

### 6. Cost watcher

Lower the cost thresholds so the `$` field turns yellow and red earlier than
the defaults ($5 / $20). Useful for personal cost discipline.

```json
{
  "thresholds": {
    "cost": { "warn": 1, "danger": 5 }
  }
}
```

The layout is unchanged — only the **color** of the cost field shifts: yellow
at $1 (instead of $5), red at $5 (instead of $20). Context thresholds are
untouched. (`danger` must stay above `warn`, or the red band never appears — the
loader does not enforce the ordering.)

---

### 7. Burn rate + branch tracking

Append a session-average burn rate after cost, and keep the `↑`/`↓`
ahead/behind commit counts on the branch (on by default — set `false` to drop
them and show just the branch name).

```json
{
  "fields": {
    "burnRate": true,
    "gitAheadBehind": true
  }
}
```

Sample output (1M-window session in a dirty `v2` branch, $23.50 spent):

```
▌ claude-statusline-v2 · v2* · Opus 4.8 · 1M
ctx ▰▰▰▰▰▰▰▱▱▱ 72%  · ⏱ 1h47m · $23.50  · ↑$13/h · +342 / −89
```

`↑$13/h` is the burn rate (session-average `cost / wall-clock hours`); `v2*`
shows the branch with a `*` dirty marker; `1M` appears because the window size
differs from the 200k default.

---

### 8. No color / locked-down environment

For terminals that don't render ANSI reliably, or where policy discourages
color. Set `NO_COLOR` in your shell — it disables all color regardless of
config (and wins over `FORCE_COLOR`).

```bash
# ~/.zshrc or ~/.bashrc
export NO_COLOR=1
```

Every layout, threshold, and field still applies — the bar just renders as
plain text (the `▌` pixel and `·` separators are plain Unicode, not color
escapes). The sample outputs throughout this file are exactly what `NO_COLOR`
produces.

---

> **Reserved fields.** v1 examples that toggled individual core fields
> (`disable loc`, `disable duration`) or enabled `apiRatio` / `outputStyle` do
> **not** apply to v2 — core segments aren't individually toggleable (pick a
> `layout` instead), and `apiRatio` / `outputStyle` / `rateLimits` are accepted
> but not yet rendered. See [CONFIG.md §6](CONFIG.md#6-fields).
