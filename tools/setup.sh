#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
export EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"
# 上流へ出すことを見据えて、Equicord 側での配置は src/equicordplugins/ とし、
# ディレクトリ名も上流の慣習 (camelCase) に合わせる。リポジトリ名ではなく
# この名前がプラグインディレクトリ名になる
PLUGIN_PARENT="src/equicordplugins"
LINK_NAME="localNicknames"
LEGACY_LINK="$EQUICORD_DIR/src/userplugins/$(basename "$PLUGIN_DIR")"

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

# 以前は src/userplugins/ へリンクしていた。残っていると同じプラグインが
# 二重に取り込まれてビルドが壊れるので、リンクであれば取り除く
if [ -L "$LEGACY_LINK" ]; then
    rm -f "$LEGACY_LINK"
    echo "removed legacy link: $LEGACY_LINK"
fi

mkdir -p "$EQUICORD_DIR/$PLUGIN_PARENT"
ln -sfn "$PLUGIN_DIR" "$EQUICORD_DIR/$PLUGIN_PARENT/$LINK_NAME"

"$HERE/gen-tsconfig.sh"

echo "setup complete"
echo "  Equicord : $EQUICORD_DIR"
echo "  linked   : $PLUGIN_PARENT/$LINK_NAME -> $PLUGIN_DIR"
