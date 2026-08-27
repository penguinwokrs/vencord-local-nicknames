#!/usr/bin/env bash
set -euo pipefail

# なぜこのスクリプトが要るか:
# Vencord の esbuild ビルドは tsconfig を明示指定せず、各ソースファイルの
# 実体パス (symlink 解決後の実パス) から上位ディレクトリへ辿って
# tsconfig.json を探索する。tools/setup.sh はこのリポジトリを
# $VENCORD_DIR/src/userplugins/ へシンボリックリンクするだけなので、
# このリポジトリが Vencord のツリーの外にある限り、その探索は Vencord 本体の
# tsconfig.json (と、そこに定義された "@utils/*" 等のパスエイリアス) まで
# 辿り着けない。回避策として、このリポジトリのルート自体に
# Vencord のエイリアスを指す tsconfig.json を置く必要がある。
# ただし $VENCORD_DIR は実行時に変わりうる (環境変数で上書き可能、clone 先も
# 人によって異なる) ので、相対パスを直書きしてコミットすると
# VENCORD_DIR を変えた途端に壊れる。そのため tsconfig.json は生成物とし、
# このスクリプトが都度、実際の VENCORD_DIR から相対パスを計算して書き出す。
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

REL="$(realpath --relative-to="$PLUGIN_DIR" "$VENCORD_DIR")"

cat > "$PLUGIN_DIR/tsconfig.json" <<EOF
{
    "compilerOptions": {
        "paths": {
            "@main/*": ["$REL/src/main/*"],
            "@api/*": ["$REL/src/api/*"],
            "@components/*": ["$REL/src/components/*"],
            "@debug/*": ["$REL/src/debug/*"],
            "@utils/*": ["$REL/src/utils/*"],
            "@plugins/*": ["$REL/src/plugins/*"],
            "@shared/*": ["$REL/src/shared/*"],
            "@webpack/common": ["$REL/src/webpack/common"],
            "@webpack/common/*": ["$REL/src/webpack/common/*"],
            "@webpack": ["$REL/src/webpack/webpack"],
            "@webpack/patcher": ["$REL/src/webpack/patchWebpack"],
            "@webpack/wreq.d": ["$REL/src/webpack/wreq.d"],
            "@webpack/types": ["$REL/src/webpack/types"]
        }
    }
}
EOF

echo "generated: $PLUGIN_DIR/tsconfig.json (VENCORD_DIR=$VENCORD_DIR)"
