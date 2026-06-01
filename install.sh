#!/bin/sh
# install.sh — curl install for claude-statusline
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Kanyandula/claude-statusline/main/install.sh | sh
#
# This installs ONLY the render-side script, not the full CLI. Use this on
# machines where `npm i -g @kanyandula/claude-statusline` isn't an option.
# Switch to npm later if/when it becomes available — that gives you the
# `claude-statusline` CLI for init/layout/enable/preview/uninstall.

set -eu

REPO="Kanyandula/claude-statusline"
HELPER_DIR="$HOME/.claude/helpers/claude-statusline"
SETTINGS="$HOME/.claude/settings.json"
# Pin to a release tag so the file list and source stay in sync with the
# install.sh asset published at that tag. Bump VERSION when releasing.
VERSION="v1.0.0"
RAW_BASE="https://raw.githubusercontent.com/$REPO/refs/tags/$VERSION"

# Source files needed to render the statusline. This list MUST be updated
# whenever new files are added to src/cli/ or src/. Pinned to VERSION above.
FILES="
bin/statusline.js
src/cli/render.js
src/cli/paths.js
src/cli/colour.js
src/cli/config-file.js
src/cli/fs-util.js
src/pipeline.js
src/input.js
src/adapters/claude.js
src/render.js
src/format.js
src/models.js
src/ansi.js
src/config.js
src/git.js
"

echo "Installing claude-statusline renderer into $HELPER_DIR..."
mkdir -p "$HELPER_DIR"

for f in $FILES; do
  dest="$HELPER_DIR/$f"
  mkdir -p "$(dirname "$dest")"
  if ! curl -fsSL "$RAW_BASE/$f" -o "$dest"; then
    echo "ERROR: failed to download $f from $RAW_BASE" >&2
    exit 1
  fi
done

CMD="node $HELPER_DIR/bin/statusline.js"

echo "Renderer installed: $HELPER_DIR/bin/statusline.js"

if command -v jq >/dev/null 2>&1; then
  if [ -f "$SETTINGS" ]; then
    cp "$SETTINGS" "$SETTINGS.bak.$(date +%s)"
    jq --arg cmd "$CMD" \
       '. + {statusLine: {type: "command", command: $cmd}}' \
       "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
    echo "Wired statusLine into $SETTINGS (backup saved)."
  else
    mkdir -p "$(dirname "$SETTINGS")"
    cat > "$SETTINGS" <<EOF
{
  "statusLine": {
    "type": "command",
    "command": "$CMD"
  }
}
EOF
    echo "Created $SETTINGS with statusLine wired."
  fi
else
  echo
  echo "jq not found — add this to $SETTINGS manually:"
  echo
  echo '  "statusLine": {'
  echo '    "type": "command",'
  echo "    \"command\": \"$CMD\""
  echo '  }'
  echo
fi

echo
echo "Done. Restart Claude Code to see the statusline."
echo "Without the CLI, customise by editing ~/.claude/claude-statusline.json directly."
echo "See https://github.com/$REPO/blob/main/docs/CONFIG.md for the schema."
