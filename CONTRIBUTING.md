# Contributing to claude-statusline

## How to contribute

1. Fork the repo and create a branch from `main`.
   - Name prefix: `feat-` for new features, `fix-` for bug fixes, `docs-` for
     documentation-only changes.
2. Make one logical change per PR. If you find an unrelated bug, open a
   separate issue or PR.
3. Run `npm test` — all tests must stay green.
4. Open a pull request against `main` with a clear description of *why*
   the change is needed, not just *what* it does.

## Repo layout

**`src/`** — Pure renderer modules invoked by `render`. Modules: `input.js`
(read + parse stdin JSON), `adapter.js` (normalise raw data to the internal
model), `config.js` (load / merge effective config), `format.js` (format
individual fields — cost, time, tokens, model), `models.js` (model
display-name lookup), `ansi.js` (colour/SGR helpers), `git.js` (branch
detection), `pipeline.js` (orchestrate the render pipeline), `render.js`
(top-level entry point for the render subcommand).

**`src/cli/`** — CLI foundation and subcommands. Foundation modules:
`paths.js` (config file locations), `settings.js` (read/write Claude Code
`settings.json`), `config-file.js` (read/write/merge the statusline JSON
config), `fs-util.js` (small fs helpers), `parse-args.js` (minimal argument
parser — also provides `parseSubcommandArgs` for per-subcommand `--help` and
`--scope` handling), `colour.js` (terminal colour detection). Subcommands:
`init.js`, `layout.js`, `enable.js`, `set-get.js`, `preview.js`, `reset.js`,
`uninstall.js`, `render.js`. The dispatcher entry point is `index.js` — it
owns the `COMMANDS` registry and routes `argv[0]` to the right module.

**`bin/`** — Entry points. `claude-statusline.js` is the main dispatcher
(shebang → `src/cli/index.js`). `statusline.js` is a backward-compat shim
that delegates to the dispatcher for callers that still use the old binary
name.

**`test/`** — Mirrors the `src/` layout. `test/cli/` mirrors `src/cli/`.
`test/fixtures/` holds the sample stdin JSON used by renderer unit tests.
All tests use Node's built-in `node:test` runner — no test framework
dependencies.

**`docs/`** — `CONFIG.md` (full config schema reference) and `EXAMPLES.md`
(recipe gallery) are user-facing and ship in the npm bundle. Files under
`docs/superpowers/plans/` are internal implementation plans and are
excluded from the bundle.

## Adding a new subcommand

The `COMMANDS` array in `src/cli/index.js` is the **single source of truth**
for the CLI — it drives the help text, the stub guard, and (once a command is
implemented) the dispatcher routing.

Follow these steps:

1. **Register the command** in `COMMANDS` with `implemented: false`:
   ```js
   { name: 'mycommand', desc: 'One-line description', flags: ['--my-flag'], implemented: false },
   ```
   This alone makes it show in `--help` output and returns a "not implemented
   yet" stub exit instead of the "unknown command" error.

2. **Create `src/cli/mycommand.js`** exporting a `run(argv)` function:
   ```js
   import { parseSubcommandArgs } from './parse-args.js';

   export function run(argv) {
     const { scope, flags } = parseSubcommandArgs('mycommand', argv, {
       knownFlags: ['--my-flag'],
       help: 'claude-statusline mycommand [--scope=user|project] [--my-flag]\n\nOne-line description.',
     });
     // ... implementation
     return 0;
   }
   ```
   Using `parseSubcommandArgs` gives you `--help` support and `--scope`
   validation for free. Return an exit-code integer (0 = success, 64 = usage
   error, 1 = other failure).

3. **Flip `implemented: true`** in the `COMMANDS` entry, then add a dispatch
   case in the `runCli` function in `src/cli/index.js`:
   ```js
   if (cmd === 'mycommand') return (await import('./mycommand.js')).run(argv.slice(1));
   ```
   The dynamic import keeps startup time constant regardless of which
   subcommand is invoked.

4. **Add tests** in `test/cli/mycommand.test.js`. Use an absolute `BIN`
   constant (see `test/cli/init.test.js` for the pattern) so tests are
   cwd-independent:
   ```js
   import { resolve, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';
   const __dirname = dirname(fileURLToPath(import.meta.url));
   const BIN = resolve(__dirname, '../../bin/claude-statusline.js');
   ```

5. **Update docs**: edit README §7 (CLI reference) with the new subcommand,
   and update `docs/CONFIG.md` if your command introduces new config keys.

## Running tests

```sh
npm test                                   # full suite via node --test
node --test test/cli/mycommand.test.js     # single file
```

The suite uses Node's built-in `node:test` runner (available since Node 18).
No extra dependencies to install; `npm test` is the only command you need.

## Branching model

`main` is always releasable. Long-running phases use `phase-N-*` branches;
short-lived changes use `feat-*`, `fix-*`, or `docs-*`. Merge into `main`
via squash-merge or fast-forward — no merge commits in the main history.

## Commit message conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cli): add mycommand subcommand
fix(render): handle empty model display_name
docs: update CONFIG.md with new threshold keys
chore(pkg): bump version to 1.1.0
test(cli): cover mycommand --help and scope validation
refactor(pipeline): extract cost-format into format.js
```

- Subject line ≤ 72 chars (50 preferred). Imperative mood.
- Body (when needed) wrapped at 72 chars. Explain *why*, not *what*.
- No "Co-Authored-By: Claude" trailers or AI attribution of any kind.

## Code style

- **ES modules only** (`import`/`export`). No CommonJS.
- **Node ≥ 18 built-ins only.** Zero runtime dependencies — this is a hard
  line. No `chalk`, `kleur`, `minimist`, `lodash`, or any other npm package.
  If you need colour output, use `src/ansi.js`. If you need arg parsing, use
  `src/cli/parse-args.js`.
- 2-space indentation, single quotes, semicolons.
- Keep modules focused: renderer modules in `src/`, CLI modules in `src/cli/`.
  Cross-layer imports (CLI code importing renderer code) are fine; the reverse
  is not.

## Security disclosures

Open a GitHub issue with the **security** label. Private/embargoed disclosure
via email is TBD — the project will add a `SECURITY.md` and a contact address
once it gains traction.
