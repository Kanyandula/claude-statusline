# Examples

Recipe gallery for common `claude-statusline` setups. Each recipe shows the
CLI commands and/or JSON config needed, plus a sample of what the statusline
looks like. Commands without `--scope` write to the user-level config
(`~/.config/claude-statusline/config.json`).

---

### 1. Just the basics

For users who only want model, context window, context percentage, and cost
visible — nothing else. Strips out the loc counter and session duration so the
bar stays short even in long sessions.

```bash
claude-statusline layout single
claude-statusline disable loc
claude-statusline disable duration
```

The same result expressed as JSON (write to
`~/.config/claude-statusline/config.json`):

```json
{
  "layout": "single",
  "fields": {
    "loc": false,
    "duration": false
  }
}
```

Sample output:

```
▌ myproject  main │ Opus 4.7 (1M) │ ● 15% ctx │ $19.01
```

All four core fields are present; the bar never grows with LOC or duration
noise.

---

### 2. Verbose / debugging

Enable `apiRatio` and `outputStyle` for full visibility into how Claude is
spending its budget. Useful when you are profiling a session or want to
understand the output-token ratio.

```bash
claude-statusline enable apiRatio
claude-statusline enable outputStyle
```

Both fields are off by default, so only these two commands are needed on top
of the default config.

Sample output (two-line layout, default):

```
▌ myproject  main  Claude Code 1.2.3
  Opus 4.7 (1M) │ ● 72% ctx │ $4.32 │ 23m14s │ 📊 0.42 ratio │ 📝 normal
```

`📊 0.42 ratio` is the API ratio field; `📝 normal` is the output style. Both
are appended after the core fields in the order they appear in `KNOWN_FIELDS`.

---

### 3. Cost watcher

Lower the thresholds so the cost indicator turns yellow and red earlier than
the defaults ($5 / $20). Useful for personal cost discipline or when running
on a tight daily budget.

```bash
claude-statusline set thresholds.costWarnUsd 1
claude-statusline set thresholds.costDangerUsd 5
```

Equivalent JSON:

```json
{
  "thresholds": {
    "costWarnUsd": 1,
    "costDangerUsd": 5
  }
}
```

The display is identical to the default — only the colour of the `$` cost
field changes. It goes **yellow** at $1 instead of $5, and **red** at $5
instead of $20. No other fields are affected.

---

### 4. Per-project override

Apply a different layout to a single project without touching your global
config. Useful for a project where your terminal is narrower, or where you
simply don't need the full two-line layout.

```bash
cd ~/projects/narrow-terminal
claude-statusline layout single --scope=project
claude-statusline disable loc --scope=project
```

`--scope=project` writes to `<cwd>/.claude/claude-statusline.json`. When
Claude Code is open in that directory, the project config is layered on top
of your user config; all other projects are unaffected.

You can confirm what file was written:

```bash
claude-statusline get --scope=project
```

To revert the project override only:

```bash
claude-statusline reset --scope=project
```

Sample output in that project:

```
▌ narrow-terminal  main │ Sonnet 4.5 (200k) │ ● 8% ctx │ $0.47 │ 4m02s
```

---

### 5. Work laptop / locked-down environment

For machines where terminals may not render ANSI colour codes reliably, or
where policy discourages colour output. Set `NO_COLOR=1` and keep fields
minimal.

```bash
export NO_COLOR=1
claude-statusline init
claude-statusline disable apiRatio   # already off by default — illustrative
```

`NO_COLOR=1` can be set for the current session only, or persisted in your
shell rc file:

```bash
# ~/.zshrc or ~/.bashrc
export NO_COLOR=1
```

When `NO_COLOR` is set, `claude-statusline` emits no ANSI escape codes — the
statusline is plain text. All other config options (fields, thresholds,
layout) still apply; they just render without colour or bold.

Sample output with `NO_COLOR=1`:

```
myproject  main | Opus 4.7 (1M) | 15% ctx | $19.01
```

The `▌` leader and `│` separators are still Unicode characters, but no colour
escape sequences are embedded in the string.

---

### 6. Live preview workflow

Iterate on your config and see the result immediately, without restarting
Claude Code. This involves a temporary modification to `settings.json` to
capture the stdin JSON that Claude Code passes on each prompt.

**Step 1 — capture the live payload (temporary change).**

Open `~/.claude/settings.json` and find the `statusLine` block that
`claude-statusline init` wrote:

```json
"statusLine": {
  "command": "claude-statusline render"
}
```

Temporarily replace it with a `tee` wrapper:

```json
"statusLine": {
  "command": "sh -c 'tee /tmp/claude-stdin.json | claude-statusline render'"
}
```

This is a **debugging tool only** — revert the change after capturing a sample
payload. The `tee` adds a small write on every prompt, so don't leave it in
place permanently.

**Step 2 — trigger one Claude Code prompt** so that `/tmp/claude-stdin.json`
is populated.

**Step 3 — restore `settings.json`** to the original single-command form.

**Step 4 — iterate locally.**

```bash
claude-statusline layout single
claude-statusline preview --live
# adjust config, repeat
```

`preview --live` reads from `/tmp/claude-stdin.json` by default. To use a
different path, set `CLAUDE_STATUSLINE_LIVE_PATH`:

```bash
CLAUDE_STATUSLINE_LIVE_PATH=~/my-session.json claude-statusline preview --live
```

This lets you keep reference payloads from different session types (long
context, high cost, dirty branch, etc.) and preview against each.

---

### 7. Compact mode for narrow terminals

Strip every non-essential field so only model, context, and cost remain.
Fits comfortably in an 80-column terminal.

```bash
claude-statusline layout single
claude-statusline disable project
claude-statusline disable branch
claude-statusline disable loc
claude-statusline disable duration
```

Equivalent JSON:

```json
{
  "layout": "single",
  "fields": {
    "project": false,
    "branch": false,
    "loc": false,
    "duration": false
  }
}
```

Sample output:

```
▌ Opus 4.7 (1M) │ ● 15% ctx │ $19.01
```

Only the three fields that matter at a glance — model, context pressure, and
cost — are shown. The `▌` leader still signals the Claude Code turn boundary.

---

### 8. High-cost session monitoring

Combine `apiRatio` with aggressive thresholds to turn `claude-statusline` into
a lightweight cost dashboard. The red `$` jump-out happens much earlier than
the default, giving you an at-a-glance signal when a session is running away.

```bash
claude-statusline enable apiRatio
claude-statusline set thresholds.costWarnUsd 2
claude-statusline set thresholds.costDangerUsd 10
```

Equivalent JSON:

```json
{
  "fields": {
    "apiRatio": true
  },
  "thresholds": {
    "costWarnUsd": 2,
    "costDangerUsd": 10
  }
}
```

Sample output at $11 into a session:

```
▌ myproject  main  Claude Code 1.2.3
  Opus 4.7 (1M) │ ● 55% ctx │ $11.20 │ 41m03s │ 📊 0.61 ratio
```

The `$11.20` renders in **red** (past the $10 danger threshold). The
`📊 0.61 ratio` shows that 61 % of tokens are output tokens — a useful signal
when debugging why a session is expensive. This combination is particularly
useful for tracking personal Claude API spend across long research sessions.
