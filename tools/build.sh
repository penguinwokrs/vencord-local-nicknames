#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

"$HERE/gen-tsconfig.sh"

cd "$VENCORD_DIR"
pnpm build --standalone --disable-updater
