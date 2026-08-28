#!/usr/bin/env bash
set -euo pipefail

EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"
# 既定値は WSL のユーザー名と Windows のユーザー名が同じ場合を想定している。
# 異なる場合や Windows 以外で使う場合は DEPLOY_DIR を指定すること。
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/c/Users/$USER/EquicordCustom}"

SRC_DIR="$EQUICORD_DIR/dist/equibop"
FILES=(main.js renderer.js preload.js package.json)

MISSING=()
for f in "${FILES[@]}"; do
    if [ ! -f "$SRC_DIR/$f" ]; then
        MISSING+=("$f")
    fi
done

if [ ! -d "$SRC_DIR" ] || [ "${#MISSING[@]}" -ne 0 ]; then
    echo "missing: ${SRC_DIR} に必要なファイルがありません (${MISSING[*]:-ディレクトリ自体が無い})  (先に tools/build.sh を実行してください)" >&2
    exit 1
fi

DEST_DIR="$DEPLOY_DIR/equibop"

# 前回の成果物 (リネーム/削除されたファイル) が残らないよう、コピー前に
# 配置先を丸ごと消してから作り直す。
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

cp -a "$SRC_DIR/." "$DEST_DIR/"

echo "deployed: $SRC_DIR -> $DEST_DIR"
echo
echo "Equibop の設定では、この equibop/ の親ディレクトリ (=$DEPLOY_DIR) を"
echo "Equicord の場所として選択してください ($DEST_DIR ではありません)。"
