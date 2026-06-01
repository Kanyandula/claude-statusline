# Changelog

All notable changes to claude-statusline will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] — Phase 5: distribution

### Added
- Package configured for `@kanyandula/claude-statusline` on npm (publish deferred pending 2FA setup on author account)
- GitHub repository at https://github.com/Kanyandula/claude-statusline
- GitHub Actions CI (Linux + macOS × Node 18/20/22)
- Issue + PR templates
- `install.sh` curl-install fallback for environments without npm
- Real LICENSE copyright (Ephraim Kanyandula)
- `CONTRIBUTING.md`

### Changed
- `package.json` bumped to v1.0.0; added `repository`, `homepage`, `bugs`, `author`, `publishConfig`
- npm bundle scope tightened: `docs/superpowers/` excluded via `.npmignore` + explicit `files` array
- `dispatcher.test.js` uses absolute path via `import.meta.url` (was relative)

## [0.4.0] — Phase 4: docs + tests polish

### Added
- Per-subcommand `--help` text for all 9 user-facing subcommands
- `docs/CONFIG.md` — full configuration reference
- `docs/EXAMPLES.md` — recipe gallery for common setups
- Snapshot tests for renderer output

### Changed
- Top-level `--help` text now shows per-command flags in brackets and scopes
  the `--scope` option correctly to commands that accept it
- `uninstall` and `preview` migrated to `parseSubcommandArgs` for unified
  argument handling

### Fixed
- `preview --live` tests are now hermetic (use `CLAUDE_STATUSLINE_LIVE_PATH`)

## [0.3.0] — Phase 3: user-facing CLI

### Added
- `claude-statusline` CLI binary with 9 user-facing subcommands:
  `init`, `layout`, `enable`, `disable`, `set`, `get`, `preview`, `reset`,
  `uninstall`, plus internal `render`
- Foundation modules: `paths.js`, `settings.js`, `config-file.js`, `fs-util.js`,
  `parse-args.js`, `colour.js`
- Atomic JSON writes (tmp + rename), one-time backups of `settings.json`
- Path validation (must be absolute, must end in `.json`)
- Prototype-pollution guard in `get`'s dotted-path lookup
- `CLAUDE_STATUSLINE_LIVE_PATH` env var for `preview --live`

### Changed
- `bin/statusline.js` shrunk to a 3-line shim; render logic moved to
  `src/cli/render.js`
- `package.json` exposes `claude-statusline` as the primary bin entry,
  `claude-statusline-render` retained for backward compat

## [0.2.0] — Phase 2: configurable layout, fields, thresholds

### Added
- Configurable layout (`single` | `two-line`), per-field toggles for 9 fields,
  numeric thresholds for ctx % and cost colour bands
- Env-var overrides: `CLAUDE_STATUSLINE_LAYOUT`, `CLAUDE_STATUSLINE_FIELDS`
- `src/git.js` for branch + dirty detection (200ms timeout, silent failure)
- `src/pipeline.js` orchestrator with injectable `gitFn`
- Optional `apiRatio` and `outputStyle` fields

### Security
- `git` subprocess hardening: hooks and fsmonitor disabled via `-c` flags
- Config-file path validation: must be absolute, must end in `.json`
- ANSI escape injection guard: control characters stripped from
  branch name / model / output_style / project name

### Changed
- Renderer accepts a `Config` object and gates every field by `config.fields`
- Vertical-bar `│` separators between fields; bold/bright identity colours
- Duration auto-scales: `Xs` / `XmYs` / `XhYm`

## [0.1.0] — Phase 1: MVP renderer

### Added
- Initial `bin/statusline.js` rendering 4 fields from Claude Code stdin JSON:
  model + context window, session duration, context %, cost
- Pure functional modules: `format`, `models`, `ansi`, `input`, `render`
- Claude adapter mapping stdin JSON → `RenderInput`
- 36 unit tests via `node --test`
