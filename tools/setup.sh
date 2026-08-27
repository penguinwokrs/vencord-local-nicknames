#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
export VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"
LINK_NAME="$(basename "$PLUGIN_DIR")"

if [ ! -d "$VENCORD_DIR/.git" ]; then
    mkdir -p "$(dirname "$VENCORD_DIR")"
    git clone https://github.com/Vendicated/Vencord.git "$VENCORD_DIR"
fi

# tools/update.sh が git pull できるよう、浅いクローンなら深くしておく
if [ -f "$VENCORD_DIR/.git/shallow" ]; then
    git -C "$VENCORD_DIR" fetch --unshallow
fi

cd "$VENCORD_DIR"
corepack enable >/dev/null || true
pnpm install --frozen-lockfile

mkdir -p "$VENCORD_DIR/src/userplugins"
ln -sfn "$PLUGIN_DIR" "$VENCORD_DIR/src/userplugins/$LINK_NAME"

"$HERE/gen-tsconfig.sh"

echo "setup complete"
echo "  Vencord : $VENCORD_DIR"
echo "  linked  : src/userplugins/$LINK_NAME -> $PLUGIN_DIR"
