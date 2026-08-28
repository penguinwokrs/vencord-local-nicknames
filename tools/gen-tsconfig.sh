#!/usr/bin/env bash
set -euo pipefail

# なぜこのスクリプトが要るか:
# Equicord の esbuild ビルドは tsconfig を明示指定せず、各ソースファイルの
# 実体パス (symlink 解決後の実パス) から上位ディレクトリへ辿って
# tsconfig.json を探索する。tools/setup.sh はこのリポジトリを
# $EQUICORD_DIR/src/userplugins/ へシンボリックリンクするだけなので、
# このリポジトリが Equicord のツリーの外にある限り、その探索は Equicord 本体の
# tsconfig.json (と、そこに定義された "@utils/*" 等のパスエイリアス) まで
# 辿り着けない。回避策として、このリポジトリのルート自体に
# Equicord のエイリアスを指す tsconfig.json を置く必要がある。
# ただし $EQUICORD_DIR は実行時に変わりうる (環境変数で上書き可能、clone 先も
# 人によって異なる) ので、相対パスを直書きしてコミットすると
# EQUICORD_DIR を変えた途端に壊れる。そのため tsconfig.json は生成物とし、
# このスクリプトが都度、実際の EQUICORD_DIR から相対パスを計算して書き出す。
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EQUICORD_DIR="${EQUICORD_DIR:-$HOME/projects/github.com/Equicord/Equicord}"

# build.sh はカレントディレクトリを変える前に、setup.sh は
# `cd "$EQUICORD_DIR"` した後にこのスクリプトを呼ぶ。そのため相対パスの
# EQUICORD_DIR をそのまま (カレントディレクトリ基準で) 正規化すると、
# 呼び出し元によって解決結果が変わってしまう (setup.sh 側では
# 既に cd 済みの EQUICORD_DIR を基点に相対パスが再解釈され、
# パスが二重にずれる)。どちらの呼び出し元でも同じ結果になるよう、
# 相対パスは常に PLUGIN_DIR (このリポジトリのルート、カレント
# ディレクトリに依存せず一意に決まる) を基点として解決する。
# realpath -m はパスが実在しなくても正規化できるので、この時点では
# まだ EQUICORD_DIR の実在性を問わない。
if [[ "$EQUICORD_DIR" != /* ]]; then
    EQUICORD_DIR="$PLUGIN_DIR/$EQUICORD_DIR"
fi
EQUICORD_DIR="$(realpath -m "$EQUICORD_DIR")"

if [ ! -d "$EQUICORD_DIR" ]; then
    echo "gen-tsconfig.sh: EQUICORD_DIR '$EQUICORD_DIR' は存在しないか、ディレクトリではありません。EQUICORD_DIR に Equicord のチェックアウト先を指定してください。" >&2
    exit 1
fi

if [ ! -f "$EQUICORD_DIR/tsconfig.json" ] || [ ! -d "$EQUICORD_DIR/src" ]; then
    echo "gen-tsconfig.sh: EQUICORD_DIR '$EQUICORD_DIR' は Equicord のチェックアウトに見えません (tsconfig.json または src/ がありません)。EQUICORD_DIR に正しい Equicord のチェックアウト先を指定してください。" >&2
    exit 1
fi

REL="$(realpath --relative-to="$PLUGIN_DIR" "$EQUICORD_DIR")"

# 書き込み中に中断されても tsconfig.json が壊れた状態で残らないよう、
# 同じディレクトリ内の一時ファイルに書いてから mv でアトミックに置き換える。
TMP_FILE="$(mktemp "$PLUGIN_DIR/.tsconfig.json.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT

cat > "$TMP_FILE" <<EOF
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
            "@webpack/types": ["$REL/src/webpack/types"],
            "@equicordplugins/*": ["$REL/src/equicordplugins/*"]
        }
    }
}
EOF

mv "$TMP_FILE" "$PLUGIN_DIR/tsconfig.json"

echo "generated: $PLUGIN_DIR/tsconfig.json (EQUICORD_DIR=$EQUICORD_DIR)"
