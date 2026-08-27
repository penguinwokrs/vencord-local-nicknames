#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
export EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"
LINK_NAME="$(basename "$PLUGIN_DIR")"

if [ ! -d "$EQUICORD_DIR/.git" ]; then
    mkdir -p "$(dirname "$EQUICORD_DIR")"
    git clone https://github.com/Equicord/Equicord.git "$EQUICORD_DIR"
fi

# tools/update.sh が git pull できるよう、浅いクローンなら深くしておく
if [ -f "$EQUICORD_DIR/.git/shallow" ]; then
    git -C "$EQUICORD_DIR" fetch --unshallow
fi

cd "$EQUICORD_DIR"
corepack enable >/dev/null || true
pnpm install --frozen-lockfile

mkdir -p "$EQUICORD_DIR/src/userplugins"
ln -sfn "$PLUGIN_DIR" "$EQUICORD_DIR/src/userplugins/$LINK_NAME"

"$HERE/gen-tsconfig.sh"

echo "setup complete"
echo "  Equicord : $EQUICORD_DIR"
echo "  linked   : src/userplugins/$LINK_NAME -> $PLUGIN_DIR"
