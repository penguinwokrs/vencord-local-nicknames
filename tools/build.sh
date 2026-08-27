#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"

"$HERE/gen-tsconfig.sh"

cd "$EQUICORD_DIR"
pnpm build --standalone --disable-updater
