#!/usr/bin/env bash
set -euo pipefail

VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/c/Users/owner/VencordCustom}"

FILES=(vencordDesktopMain.js vencordDesktopPreload.js vencordDesktopRenderer.js vencordDesktopRenderer.css)

mkdir -p "$DEPLOY_DIR"

for f in "${FILES[@]}"; do
    if [ ! -f "$VENCORD_DIR/dist/$f" ]; then
        echo "missing: dist/$f  (run tools/build.sh first)" >&2
        exit 1
    fi
    cp "$VENCORD_DIR/dist/$f" "$DEPLOY_DIR/$f"
done

# Vesktop の isValidVencordInstall が package.json の存在も検査する
printf '{}' > "$DEPLOY_DIR/package.json"

echo "deployed to $DEPLOY_DIR"
