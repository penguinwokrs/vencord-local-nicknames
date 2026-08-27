#!/usr/bin/env bash
set -euo pipefail

VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

cd "$VENCORD_DIR"
pnpm build --standalone --disable-updater
