#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PLUGIN_DIR"
node --experimental-strip-types --test tools/*.test.mjs
