#!/bin/sh
# install.sh — curl install for claude-statusline v2
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Kanyandula/claude-statusline/v2/install.sh | sh
#
# v2 is two files (statusline.js + cli.js), zero deps. This downloads them and
# runs `cli.js init`, which wires statusline.js into ~/.claude/settings.json —
# backing the file up, merging (not clobbering) other keys, and forcing color
# on (Claude Code pipes our stdout but renders ANSI). Pass extra args through,
# e.g. `... | sh -s -- --force` to overwrite an existing statusLine.

set -eu

REPO="Kanyandula/claude-statusline"
# Branch during the pre-release soak; pin a tag (e.g. v2.0.0) at publish time.
REF="${CLAUDE_STATUSLINE_REF:-v2}"
RAW_BASE="https://raw.githubusercontent.com/$REPO/$REF"
DEST="$HOME/.claude/helpers/claude-statusline-v2"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node (>=18) is required and was not found on PATH." >&2
  exit 1
fi

echo "Installing claude-statusline v2 into $DEST ..."
mkdir -p "$DEST"
for f in statusline.js cli.js; do
  if ! curl -fsSL "$RAW_BASE/$f" -o "$DEST/$f"; then
    echo "ERROR: failed to download $f from $RAW_BASE" >&2
    exit 1
  fi
done

echo "Wiring into Claude Code ..."
node "$DEST/cli.js" init "$@"

echo
echo "Done. Restart Claude Code to see the statusline."
echo "Customise by editing ~/.claude/statusline.json (config schema lands with the config loader)."
