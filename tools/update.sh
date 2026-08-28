#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"

git -C "$EQUICORD_DIR" pull --ff-only
(cd "$EQUICORD_DIR" && pnpm install --frozen-lockfile)

"$HERE/build.sh"
"$HERE/deploy.sh"
