# claude-statusline

[![CI](https://github.com/Kanyandula/claude-statusline/actions/workflows/ci.yml/badge.svg)](https://github.com/Kanyandula/claude-statusline/actions/workflows/ci.yml)

**Current release:** [v1.0.0](https://github.com/Kanyandula/claude-statusline/releases/tag/v1.0.0) — see [CHANGELOG](CHANGELOG.md)

## What it is

A configurable statusline for Claude Code that surfaces the information you
care about — model and context window, session duration, context %, cost,
current branch, and LOC delta — without pulling in a single runtime
dependency. Ships as a single Node.js binary, requires Node ≥ 18, and
installs in under a minute.

```
▌  myproject  │  ⎇ main*  │  Opus 4.7 (1M context)
  ● 31% ctx  │  ⏱ 23h54m  │  $19.01  │  +3225 / -186
```

---

## Install

```bash
npm i -g @kanyandula/claude-statusline
```

**Without npm (locked-down environments)**

```bash
curl -fsSL https://raw.githubusercontent.com/Kanyandula/claude-statusline/main/install.sh | sh
```

This installs only the renderer — you won't get the `claude-statusline` CLI.
Customise by editing `~/.claude/claude-statusline.json` directly using the
[CONFIG reference](docs/CONFIG.md). Switch to `npm i -g @kanyandula/claude-statusline`
later if npm becomes available.

---

## Quick start

```bash
npm i -g @kanyandula/claude-statusline
claude-statusline init
# restart Claude Code — the statusline appears automatically
```

Three commands, done. The `init` subcommand writes the `statusLine` block into
`~/.claude/settings.json` and points it at the installed binary.

---

## Layouts

Two layouts are available. The default is `two-line`.

### `two-line` (default)

```
▌  myproject  │  ⎇ main*  │  Sonnet 4.5 (200K context)
  ● 12% ctx  │  ⏱ 1h03m  │  $0.42  │  +104 / -18
```

### `single`

```
▌  myproject  │  ⎇ main*  │  Sonnet 4.5 (200K)  │  ●12%  │  ⏱1h03m  │  $0.42  │  +104/-18
```

`single` is more compact: it drops " context" from the model label and uses
tight LOC formatting without spaces around the slash.

Switch layouts:

```bash
claude-statusline layout single
```

---

## Field reference

Fields are individually togglable. Two fields are off by default.

| Field | Default | Source | What it shows |
|---|---|---|---|
| `project` | on | basename of cwd | Current project/directory name |
| `branch` | on | `git rev-parse` + porcelain check | Current branch; `*` suffix when working tree is dirty |
| `model` | on | `model.display_name` (parsed) | Claude model name + context window size |
| `ctx` | on | `context_window.used_percentage` | Percentage of context window consumed |
| `duration` | on | `cost.total_duration_ms` | Wall-clock session time (e.g. `23h54m`) |
| `cost` | on | `cost.total_cost_usd` | Session USD spend |
| `loc` | on | `cost.total_lines_added`, `cost.total_lines_removed` | LOC delta for the session |
| `apiRatio` | **off** | `total_api_duration_ms / total_duration_ms` | Fraction of session time spent waiting on the API |
| `outputStyle` | **off** | `output_style.name` | Name of the active output style |

---

## Configuration

Config files are resolved in layers (each layer overrides the one above):

1. `~/.claude/claude-statusline.json` — user-level defaults
2. `<cwd>/.claude/claude-statusline.json` — project-level overrides
3. Environment variables — override both files (see [docs/CONFIG.md](docs/CONFIG.md))

Full schema reference and all available keys are documented in
[docs/CONFIG.md](docs/CONFIG.md).

### Example config

```json
{
  "layout": "single",
  "fields": {
    "loc": false,
    "apiRatio": true
  },
  "thresholds": {
    "costWarnUsd": 3,
    "costDangerUsd": 10
  }
}
```

---

## CLI reference

All subcommands accept `--help` for command-specific usage.

```
claude-statusline <subcommand> --help
```

### `init`

Writes the `statusLine` block into `~/.claude/settings.json` (or the project
settings file when `--scope project` is passed). Safe to re-run — use
`--force` to overwrite an existing block.

```bash
claude-statusline init
claude-statusline init --scope project --force
```

Options:
- `--scope <user|project>` — target settings file (default: `user`)
- `--force` — overwrite existing `statusLine` block

### `layout`

Switches the active layout. Writes to the user config unless `--scope
project` is passed.

```bash
claude-statusline layout two-line
claude-statusline layout single --scope project
```

### `enable`

Enables a field by name.

```bash
claude-statusline enable apiRatio
claude-statusline enable outputStyle --scope project
```

### `disable`

Disables a field by name.

```bash
claude-statusline disable loc
claude-statusline disable cost --scope project
```

### `set`

Sets any config key by dot-path. Values are parsed as JSON where possible,
treated as strings otherwise.

```bash
claude-statusline set layout single
claude-statusline set thresholds.costWarnUsd 5
claude-statusline set fields.loc false --scope project
```

### `get`

Prints the current resolved config (merged from all layers). Pass a key path
to read a single value.

```bash
claude-statusline get
claude-statusline get layout
claude-statusline get thresholds.costDangerUsd
```

### `preview`

Renders the statusline against a sample payload and prints it to the
terminal. Use `--live` to tail the live Claude Code session in real time.

```bash
claude-statusline preview
claude-statusline preview --live
```

### `reset`

Removes the user (or project) config file, restoring defaults.

```bash
claude-statusline reset
claude-statusline reset --scope project
```

### `uninstall`

Removes the `statusLine` block from `~/.claude/settings.json`. Pass
`--keep-config` to leave the config file intact.

```bash
claude-statusline uninstall
claude-statusline uninstall --keep-config
```

### `render` (internal)

The `render` subcommand is the hook Claude Code invokes on every tick. It
reads a JSON payload from stdin and writes the rendered statusline to stdout.
You should not need to call it directly, but it is useful for debugging (see
[Troubleshooting](#troubleshooting)).

---

## Optional extensions

Two fields are disabled by default because they are situational.

### `apiRatio`

Shows what fraction of session time was spent waiting on the Claude API.
Useful when profiling slow turns.

```bash
claude-statusline enable apiRatio
```

Appears as:

```
🌐 38%
```

### `outputStyle`

Shows the name of the currently active output style.

```bash
claude-statusline enable outputStyle
```

Appears as:

```
📐 concise
```

Both fields obey the same `--scope` flag as `enable` and can be toggled per
project.

---

## Troubleshooting

**I ran `init` but nothing shows up in Claude Code.**

Work through this checklist in order:

1. **Check Claude Code version.** The `statusLine` setting was added in a
   recent Claude Code release. Update to the latest version if you are unsure.

2. **Restart Claude Code completely.** The settings file is read at startup.
   Run `/exit` inside Claude Code and relaunch — a reload is not enough.

3. **Test the render script standalone.** Pipe the bundled sample payload
   through `render` to confirm the binary works:

   ```bash
   cat ~/claude-statusline/test/fixtures/stdin-sample.json | claude-statusline render
   ```

   If the package is installed globally via npm, `claude-statusline` is on
   your `PATH`. Otherwise call the binary directly:

   ```bash
   cat /path/to/repo/test/fixtures/stdin-sample.json | node /path/to/repo/bin/statusline.js
   ```

   You should see two lines of rendered output. If you see an error, that is
   where to focus.

4. **Verify `settings.json` has the `statusLine` block.**

   ```bash
   grep -A5 statusLine ~/.claude/settings.json
   ```

   If the block is missing, re-run `claude-statusline init`.

5. **Run with debug output.** Set `CLAUDE_STATUSLINE_DEBUG=1` before
   launching Claude Code — errors from the render script will appear on
   stderr in the terminal where you started Claude Code.

   ```bash
   CLAUDE_STATUSLINE_DEBUG=1 claude
   ```

6. **Inspect captured stdin.** If the script runs but the output looks wrong,
   temporarily wrap the command in `settings.json` with `tee` to capture
   exactly what Claude Code is sending:

   ```bash
   # In settings.json, temporarily change the command to:
   # sh -c 'tee /tmp/claude-stdin.json | claude-statusline render'
   ```

   Then review `/tmp/claude-stdin.json`, or pipe it through
   `claude-statusline preview --live` to watch updates in real time.

---

## Compatibility

| Environment | Status |
|---|---|
| macOS | Tested |
| Linux | Should work — POSIX-only assumptions |
| WSL | Should work |
| Native Windows | Partial — `git` shell-out and tmp paths assume POSIX; PRs welcome |
| Claude Code version | Requires `statusLine` setting support (recent versions) |

---

## Why this exists

Some work environments permit npm-installable tools but block plugin
installers or sideloaded binaries. Claude Code has no built-in statusline;
ruflo and similar solutions require an installer that many locked-down
machines reject. `claude-statusline` is zero-dependency, ships as a single
file, and is straightforward to audit — making it viable in constrained
environments where richer tooling is not.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide — repo layout,
adding subcommands, commit conventions, code style, and how to run tests.

---

## License

MIT — see [LICENSE](LICENSE).
