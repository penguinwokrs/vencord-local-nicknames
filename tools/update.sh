#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

git -C "$VENCORD_DIR" pull --ff-only
(cd "$VENCORD_DIR" && pnpm install --frozen-lockfile)

"$HERE/build.sh"
"$HERE/deploy.sh"
