# LocalNicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discord の他ユーザーに、自分のクライアント内でのみ有効なニックネームを付けられる Vencord UserPlugin を作り、Vesktop で動かす。

**Architecture:** Discord 側の名前の供給源4つ（`UsernameUtils.getName` / `UsernameUtils.useName` / `GuildMemberStore.getNick` / `RelationshipStore.getNickname`）を起動時に実行時ラップし、ローカルニックネームがあれば必ずそれを返す。webpack patch は使わない。サーバーごとの分岐を一切持たないため「どのサーバーで見ても同じ表示」が構造的に保証される。純粋ロジックは Vencord に依存しない `nickname.ts` に切り出し、Node 組み込みのテストランナーで TDD する。

**Tech Stack:** TypeScript / React (Vencord)、Node.js 22 組み込みテストランナー、esbuild（Vencord のビルド）、bash

設計書: `docs/superpowers/specs/2026-08-27-local-nicknames-design.md`

## Global Constraints

- Node `>=22`、pnpm `11.9.0`（Vencord の `packageManager` と一致させる）
- **リポジトリのルートに `package.json` を置かない。** Vencord は プラグインディレクトリを `import p from "./userplugins/<dir>"` で読むため、`package.json` があると Node の解決規則で `main` が先に評価され `index.tsx` に到達できなくなる
- **新しい依存を一切追加しない。** テストは Node 組み込みの `node:test` と `--experimental-strip-types` のみを使う
- プラグイン名（`definePlugin` の `name`）は `LocalNicknames`
- 作者は `[{ name: "penguinwokrs", id: 0n }]`
- **`src/**` 配下の全ファイルに以下のライセンスヘッダが必須**（Vencord の ESLint `simple-header/header` ルール。シンボリックリンク経由で本リポジトリも対象になる。`.mjs` も含む）:

```
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
```

- コードスタイル（Vencord の ESLint）: インデント4スペース、文字列はダブルクォート、セミコロン必須、アロー関数の引数は不要な括弧を付けない（`arrow-parens: as-needed`）、`{ a }` のように波括弧の内側にスペース、ファイル末尾に改行
- ビルドは常に `pnpm build --standalone --disable-updater`
- Vencord のクローン先: `$HOME/projects/github.com/Vendicated/Vencord`（環境変数 `VENCORD_DIR` で上書き可）
- 配置先: `/mnt/c/Users/owner/VencordCustom`（環境変数 `DEPLOY_DIR` で上書き可）
- UI の文言は日本語。本計画に書かれた文字列をそのまま使う

**Vencord には自動テストの仕組みがない。** 各タスクの検証は次の3層で行う:

1. `tools/test.sh` — 純粋ロジックの単体テスト（Task 2 で作る）
2. `pnpm testTsc` と `pnpm lint`（Vencord ディレクトリで実行）
3. Vesktop を再起動しての目視確認

## File Structure

依存の向きは一方向で、循環が無いこと。

```
nickname.ts          純粋ロジック。Vencord/React を一切 import しない。テスト対象
   ↑
store.ts             設定の定義（definePluginSettings）、読み書き、Flux 通知
   ↑            ↑                    ↑
nameOverride.ts   NicknameModal.tsx   NicknameList.tsx
   ↑            ↑                    ↑
        index.tsx    definePlugin、コンテキストメニュー、start/stop
```

| ファイル | 責務 |
| --- | --- |
| `nickname.ts` | 入力の正規化、保存データからの引き当て、一覧用のソート。副作用なし |
| `store.ts` | `definePluginSettings` による永続化、自分自身の除外、`USER_UPDATE` の発火 |
| `nameOverride.ts` | 4つの関数のラップと復元、元の名前の取得 |
| `NicknameModal.tsx` | 入力モーダル |
| `NicknameList.tsx` | 設定画面に出す一覧と削除ボタン |
| `index.tsx` | プラグイン定義、`user-context` メニュー |
| `tools/*.sh` | セットアップ、ビルド、配置、更新、テスト |
| `tools/nickname.test.mjs` | `nickname.ts` の単体テスト |
| `README.md` | 導入手順と実機検証チェックリスト |

---

### Task 1: ビルド環境の構築と最小プラグインの疎通

Vesktop が自作 Vencord ビルドを読み込み、プラグイン一覧に `LocalNicknames` が出るところまでを通す。ここが通らないと以降のタスクは一切検証できない。

**Files:**
- Create: `tools/setup.sh`
- Create: `tools/build.sh`
- Create: `tools/deploy.sh`
- Create: `tools/update.sh`
- Create: `index.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `tools/build.sh` と `tools/deploy.sh`（以降の全タスクが検証に使う）。`index.tsx` のデフォルトエクスポート（`definePlugin` の戻り値）

- [ ] **Step 1: `tools/setup.sh` を書く**

```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"
LINK_NAME="$(basename "$PLUGIN_DIR")"

if [ ! -d "$VENCORD_DIR/.git" ]; then
    mkdir -p "$(dirname "$VENCORD_DIR")"
    git clone https://github.com/Vendicated/Vencord.git "$VENCORD_DIR"
fi

# tools/update.sh が git pull できるよう、浅いクローンなら深くしておく
if [ -f "$VENCORD_DIR/.git/shallow" ]; then
    git -C "$VENCORD_DIR" fetch --unshallow
fi

cd "$VENCORD_DIR"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

mkdir -p "$VENCORD_DIR/src/userplugins"
ln -sfn "$PLUGIN_DIR" "$VENCORD_DIR/src/userplugins/$LINK_NAME"

echo "setup complete"
echo "  Vencord : $VENCORD_DIR"
echo "  linked  : src/userplugins/$LINK_NAME -> $PLUGIN_DIR"
```

- [ ] **Step 2: `tools/build.sh` を書く**

```bash
#!/usr/bin/env bash
set -euo pipefail

VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

cd "$VENCORD_DIR"
pnpm build --standalone --disable-updater
```

- [ ] **Step 3: `tools/deploy.sh` を書く**

```bash
#!/usr/bin/env bash
set -euo pipefail

VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/c/Users/owner/VencordCustom}"

FILES="vencordDesktopMain.js vencordDesktopPreload.js vencordDesktopRenderer.js vencordDesktopRenderer.css"

mkdir -p "$DEPLOY_DIR"

for f in $FILES; do
    if [ ! -f "$VENCORD_DIR/dist/$f" ]; then
        echo "missing: dist/$f  (run tools/build.sh first)" >&2
        exit 1
    fi
    cp "$VENCORD_DIR/dist/$f" "$DEPLOY_DIR/$f"
done

# Vesktop の isValidVencordInstall が package.json の存在も検査する
printf '{}' > "$DEPLOY_DIR/package.json"

echo "deployed to $DEPLOY_DIR"
```

- [ ] **Step 4: `tools/update.sh` を書く**

```bash
#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/projects/github.com/Vendicated/Vencord}"

git -C "$VENCORD_DIR" pull --ff-only
(cd "$VENCORD_DIR" && pnpm install --frozen-lockfile)

"$HERE/build.sh"
"$HERE/deploy.sh"
```

- [ ] **Step 5: 実行権限を付けてセットアップを走らせる**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
chmod +x tools/*.sh
./tools/setup.sh
```
Expected: `setup complete` と、リンク先が表示される。`ls -l ~/projects/github.com/Vendicated/Vencord/src/userplugins/` でシンボリックリンクが1本見えること。

- [ ] **Step 6: 最小の `index.tsx` を書く**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

export default definePlugin({
    name: "LocalNicknames",
    description: "他のユーザーに、自分のクライアント内でのみ有効なニックネームを付けます。サーバーをまたいでも同じ表示になります。",
    authors: [{ name: "penguinwokrs", id: 0n }],
    tags: ["Appearance", "Customisation"]
});
```

- [ ] **Step 7: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: どちらもエラーなしで終了（終了コード 0）。

失敗する場合はライセンスヘッダ、インデント、クォートを Global Constraints に合わせる。

- [ ] **Step 8: ビルドして配置する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
./tools/build.sh && ./tools/deploy.sh
```
Expected: `deployed to /mnt/c/Users/owner/VencordCustom`。
`ls /mnt/c/Users/owner/VencordCustom` に `package.json` と `vencordDesktop*` の4ファイルが並ぶこと。

- [ ] **Step 9: Vesktop に参照先を教えて疎通を確認する（手動）**

1. Vesktop を起動する
2. 設定 → Vesktop Settings → **Vencord Location** で `C:\Users\owner\VencordCustom` を選ぶ
3. Vesktop を再起動する
4. 設定 → Plugins で `LocalNicknames` を検索する

Expected: `LocalNicknames` がプラグイン一覧に出る。有効化のトグルが操作できる。**ここで有効にしておく。**

出てこない場合は Ctrl+Shift+I で DevTools を開き、Console のエラーを確認する。

- [ ] **Step 10: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add tools index.tsx
git commit -m "feat: ビルド環境と最小プラグインを追加"
```

---

### Task 2: 純粋ロジック `nickname.ts`（TDD）

保存データの扱いを、Vencord に依存しない純粋関数として作る。ここだけが自動テストできる層なので、境界条件をここに寄せる。

**Files:**
- Create: `nickname.ts`
- Create: `tools/nickname.test.mjs`
- Create: `tools/test.sh`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface NicknameEntry { nickname: string; label: string; }`
  - `type NicknameMap = Record<string, NicknameEntry>`
  - `normalizeNickname(input: string): string | null`
  - `lookupNickname(map: NicknameMap | undefined, userId: string | undefined): string | null`
  - `sortedEntries(map: NicknameMap | undefined): Array<{ userId: string; nickname: string; label: string; }>`

- [ ] **Step 1: `tools/test.sh` を書く**

```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PLUGIN_DIR"
node --experimental-strip-types --test tools/*.test.mjs
```

- [ ] **Step 2: 失敗するテストを書く**

`tools/nickname.test.mjs`:

```javascript
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { lookupNickname, normalizeNickname, sortedEntries } from "../nickname.ts";

test("normalizeNickname: 前後の空白を落とす", () => {
    assert.equal(normalizeNickname("  ぺんぎん  "), "ぺんぎん");
});

test("normalizeNickname: 空文字列は null", () => {
    assert.equal(normalizeNickname(""), null);
});

test("normalizeNickname: 空白のみは null", () => {
    assert.equal(normalizeNickname("   \t "), null);
});

test("lookupNickname: 登録済みの userId を引ける", () => {
    const map = { "123": { nickname: "ぺんぎん", label: "penguin" } };
    assert.equal(lookupNickname(map, "123"), "ぺんぎん");
});

test("lookupNickname: 未登録は null", () => {
    assert.equal(lookupNickname({}, "123"), null);
});

test("lookupNickname: map や userId が無ければ null", () => {
    assert.equal(lookupNickname(undefined, "123"), null);
    assert.equal(lookupNickname({}, undefined), null);
});

test("lookupNickname: 壊れたエントリは無視する", () => {
    assert.equal(lookupNickname({ "1": null }, "1"), null);
    assert.equal(lookupNickname({ "2": { nickname: 42 } }, "2"), null);
    assert.equal(lookupNickname({ "3": { nickname: "  " } }, "3"), null);
});

test("sortedEntries: label の昇順で返す", () => {
    const map = {
        "2": { nickname: "い", label: "bravo" },
        "1": { nickname: "あ", label: "alpha" }
    };
    assert.deepEqual(sortedEntries(map), [
        { userId: "1", nickname: "あ", label: "alpha" },
        { userId: "2", nickname: "い", label: "bravo" }
    ]);
});

test("sortedEntries: 壊れたエントリを除外する", () => {
    const map = {
        "1": { nickname: "あ", label: "alpha" },
        "2": null,
        "3": { nickname: "   ", label: "charlie" }
    };
    assert.deepEqual(sortedEntries(map), [
        { userId: "1", nickname: "あ", label: "alpha" }
    ]);
});

test("sortedEntries: label が無ければ userId で代用する", () => {
    const map = { "999": { nickname: "あ" } };
    assert.deepEqual(sortedEntries(map), [
        { userId: "999", nickname: "あ", label: "999" }
    ]);
});

test("sortedEntries: map が無ければ空配列", () => {
    assert.deepEqual(sortedEntries(undefined), []);
});
```

- [ ] **Step 3: テストを走らせて失敗を確認する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
chmod +x tools/test.sh && ./tools/test.sh
```
Expected: FAIL。`Cannot find module` 相当のエラーで `nickname.ts` が無いと言われる。

- [ ] **Step 4: `nickname.ts` を実装する**

```ts
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface NicknameEntry {
    /** 表示に使うニックネーム */
    nickname: string;
    /** 保存した時点で見えていた元の表示名。設定画面の一覧で「誰か」を示すために持つ */
    label: string;
}

export type NicknameMap = Record<string, NicknameEntry>;

/**
 * 入力を保存可能な形に正規化する。
 * 空欄・空白のみは null を返す（＝ニックネームの解除）。
 */
export function normalizeNickname(input: string): string | null {
    const trimmed = input.trim();
    return trimmed.length === 0 ? null : trimmed;
}

/**
 * 保存データから userId のニックネームを引く。
 * 壊れた形のエントリは無視して null を返す。
 */
export function lookupNickname(map: NicknameMap | undefined, userId: string | undefined): string | null {
    if (!map || !userId) return null;

    const entry = map[userId];
    if (!entry || typeof entry.nickname !== "string") return null;

    const trimmed = entry.nickname.trim();
    return trimmed.length === 0 ? null : trimmed;
}

/**
 * 設定画面の一覧用に、元の名前の昇順で並べたエントリを返す。
 * 壊れた形のエントリは除外する。
 */
export function sortedEntries(map: NicknameMap | undefined): Array<{ userId: string; nickname: string; label: string; }> {
    if (!map) return [];

    return Object.entries(map)
        .filter(([, entry]) => entry != null && typeof entry.nickname === "string" && entry.nickname.trim().length > 0)
        .map(([userId, entry]) => ({
            userId,
            nickname: entry.nickname,
            label: typeof entry.label === "string" && entry.label.length > 0 ? entry.label : userId
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames && ./tools/test.sh
```
Expected: PASS。`# pass 11` `# fail 0`。

- [ ] **Step 6: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: 終了コード 0。

`.mjs` は `allowJs` で取り込まれるが `checkJs` が無効なので tsc は通る。

ESLint が `"../nickname.ts"` の拡張子付き import を拒否した場合は、
`tools/nickname.test.mjs` のライセンスヘッダの直後に次の1行を置く。
テストファイルは Vencord のビルド対象ではないため、これによる影響はない。
`eslint.config.mjs` は Vencord 本体のファイルなので絶対に変更しない（更新時に競合する）。

```javascript
/* eslint-disable */
```

- [ ] **Step 7: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add nickname.ts tools/nickname.test.mjs tools/test.sh
git commit -m "feat: ニックネームの純粋ロジックとテストを追加"
```

---

### Task 3: 保存層 `store.ts`

設定への永続化と、自分自身の除外、変更時の再描画通知をまとめる。

**Files:**
- Create: `store.ts`

**Interfaces:**
- Consumes: `nickname.ts` の `NicknameMap` / `lookupNickname` / `normalizeNickname`
- Produces:
  - `settings`（`definePluginSettings` の戻り値。`settings.store.nicknames: NicknameMap`）
  - `getNickname(userId: string | undefined): string | null`
  - `setNickname(userId: string, input: string, label: string): void`
  - `clearNickname(userId: string): void`

- [ ] **Step 1: `store.ts` を実装する**

```ts
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { FluxDispatcher, UserStore } from "@webpack/common";

import { lookupNickname, NicknameMap, normalizeNickname } from "./nickname";

export const settings = definePluginSettings({
    nicknames: {
        type: OptionType.CUSTOM,
        default: {} as NicknameMap
    }
});

/**
 * userId に対するローカルニックネームを返す。無ければ null。
 * 描画の最内周から毎フレーム呼ばれるので、例外を絶対に外へ出さない。
 */
export function getNickname(userId: string | undefined): string | null {
    if (!userId) return null;

    try {
        // 自分自身は対象外。GuildMemberStore.getNick は「サーバープロフィールを編集」の
        // 初期値にも使われるため、書き換えると自分の nick を誤って上書きしうる
        if (userId === UserStore.getCurrentUser()?.id) return null;

        return lookupNickname(settings.store.nicknames, userId);
    } catch {
        return null;
    }
}

/**
 * ニックネームを保存する。入力が空欄・空白のみなら削除（＝解除）になる。
 * label には保存時点で見えていた元の表示名を渡す。
 */
export function setNickname(userId: string, input: string, label: string): void {
    const nickname = normalizeNickname(input);
    const next: NicknameMap = { ...settings.store.nicknames };

    if (nickname === null) delete next[userId];
    else next[userId] = { nickname, label };

    settings.store.nicknames = next;
    notifyUserUpdate(userId);
}

/** ニックネームを解除する。 */
export function clearNickname(userId: string): void {
    const next: NicknameMap = { ...settings.store.nicknames };
    delete next[userId];

    settings.store.nicknames = next;
    notifyUserUpdate(userId);
}

/**
 * 描画済みの要素を更新させるため、対象ユーザーの USER_UPDATE を流す。
 * UserStore から取り出した実物をそのまま流すだけで、サーバーへの送信は発生しない。
 */
function notifyUserUpdate(userId: string): void {
    try {
        const user = UserStore.getUser(userId);
        if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
    } catch (e) {
        console.error("[LocalNicknames] USER_UPDATE の発火に失敗しました", e);
    }
}
```

- [ ] **Step 2: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: 終了コード 0。

- [ ] **Step 3: 純粋ロジックのテストが壊れていないことを確認する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames && ./tools/test.sh
```
Expected: `# pass 11` `# fail 0`。

- [ ] **Step 4: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add store.ts
git commit -m "feat: ニックネームの保存層を追加"
```

---

### Task 4: 名前解決の横取り `nameOverride.ts`

このタスクの完了時点で、UI はまだ無いが「設定ファイルに直接書いたニックネームが画面に出る」ところまで動く。

`@webpack/common` の `UsernameUtils` / `GuildMemberStore` / `RelationshipStore` は遅延 Proxy だが、`set` トラップが `Reflect.set` で実体へ転送されるため、プロパティへの代入で実体の関数を差し替えられる（`src/utils/lazy.ts`）。

**Files:**
- Create: `nameOverride.ts`
- Modify: `index.tsx`

**Interfaces:**
- Consumes: `store.ts` の `getNickname`、`store.ts` の `settings`
- Produces:
  - `applyNameOverrides(): void`
  - `removeNameOverrides(): void`
  - `getOriginalName(user: { globalName?: string | null; username: string; }): string` — ラップ前の表示名を返す。`label` の保存に使う

- [ ] **Step 1: `nameOverride.ts` を実装する**

```ts
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildMemberStore, RelationshipStore, UsernameUtils } from "@webpack/common";

import { getNickname } from "./store";

type AnyFn = (...args: any[]) => any;

interface Wrap {
    target: any;
    method: string;
    original: AnyFn;
}

const wraps: Wrap[] = [];

/** ラップ前の UsernameUtils.getName。元の表示名を得るために保持する */
let originalGetName: AnyFn | null = null;

function wrap(target: any, method: string, make: (original: AnyFn) => AnyFn, label: string): AnyFn | null {
    try {
        const original = target?.[method];
        if (typeof original !== "function") {
            console.warn(`[LocalNicknames] ${label} が見つかりませんでした。この経路の置き換えは無効になります。`);
            return null;
        }

        target[method] = make(original);
        wraps.push({ target, method, original });
        return original;
    } catch (e) {
        console.error(`[LocalNicknames] ${label} のラップに失敗しました`, e);
        return null;
    }
}

export function applyNameOverrides(): void {
    originalGetName = wrap(UsernameUtils, "getName", original => function (this: any, user: any) {
        return getNickname(user?.id) ?? original.call(this, user);
    }, "UsernameUtils.getName");

    wrap(UsernameUtils, "useName", original => function (this: any, user: any) {
        // フックなので、ニックネームがある場合でも必ず先に元のフックを呼ぶ。
        // 呼び出し順序が変わると React のフック規則に違反する
        const originalName = original.call(this, user);
        return getNickname(user?.id) ?? originalName;
    }, "UsernameUtils.useName");

    wrap(GuildMemberStore, "getNick", original => function (this: any, guildId: any, userId: any) {
        return getNickname(userId) ?? original.call(this, guildId, userId);
    }, "GuildMemberStore.getNick");

    wrap(RelationshipStore, "getNickname", original => function (this: any, userId: any) {
        return getNickname(userId) ?? original.call(this, userId);
    }, "RelationshipStore.getNickname");
}

export function removeNameOverrides(): void {
    while (wraps.length) {
        const { target, method, original } = wraps.pop()!;
        try {
            target[method] = original;
        } catch (e) {
            console.error(`[LocalNicknames] ${method} の復元に失敗しました`, e);
        }
    }
    originalGetName = null;
}

/**
 * ラップ前の表示名を返す。
 * getName はラップ済みでニックネームを返してしまうため、保存する label にはこちらを使う。
 */
export function getOriginalName(user: { globalName?: string | null; username: string; }): string {
    try {
        if (originalGetName) return originalGetName.call(UsernameUtils, user);
    } catch {
        // 下のフォールバックに落とす
    }
    return user.globalName || user.username;
}
```

- [ ] **Step 2: `index.tsx` に配線する**

`index.tsx` を次の内容に置き換える:

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

import { applyNameOverrides, removeNameOverrides } from "./nameOverride";
import { settings } from "./store";

export default definePlugin({
    name: "LocalNicknames",
    description: "他のユーザーに、自分のクライアント内でのみ有効なニックネームを付けます。サーバーをまたいでも同じ表示になります。",
    authors: [{ name: "penguinwokrs", id: 0n }],
    tags: ["Appearance", "Customisation"],
    settings,

    start() {
        applyNameOverrides();
    },

    stop() {
        removeNameOverrides();
    }
});
```

- [ ] **Step 3: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: 終了コード 0。

- [ ] **Step 4: ビルドして配置する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
./tools/build.sh && ./tools/deploy.sh
```
Expected: `deployed to /mnt/c/Users/owner/VencordCustom`。

- [ ] **Step 5: 設定ファイルに直接1件書いて効果を確認する（手動）**

UI がまだ無いので、保存データを手で作って横取りが効いているかを見る。

1. Vesktop を終了する
2. 対象にするユーザーの ID を1つ用意する（Discord で開発者モードを有効にし、ユーザーを右クリック →「ユーザーIDをコピー」）
3. `/mnt/c/Users/owner/AppData/Roaming/vesktop/settings/settings.json` を開き、`"plugins"` の中に次を追加する（`<USER_ID>` は実際の ID、既に `LocalNicknames` の項目があれば `nicknames` だけ足す）:

```json
"LocalNicknames": {
    "enabled": true,
    "nicknames": {
        "<USER_ID>": { "nickname": "テスト表示名", "label": "元の名前" }
    }
}
```

4. Vesktop を起動する

Expected:
- そのユーザーがメンバーリスト、メッセージヘッダ、DM リストで `テスト表示名` と表示される
- **サーバーニックネームが設定されているユーザーで試し、サーバーニックネームより優先されること**
- **別のサーバーで同じユーザーを見ても `テスト表示名` のままであること**
- DevTools の Console に `[LocalNicknames]` の warn / error が出ていないこと

`が見つかりませんでした` の warn が出た場合、その経路だけ Discord 側の内部変更で壊れている。どの関数かを記録して報告する。

- [ ] **Step 6: 確認用のデータを消す（手動）**

Vesktop を終了し、`settings.json` に足した `nicknames` の中身を `{}` に戻してから再起動する。

- [ ] **Step 7: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add nameOverride.ts index.tsx
git commit -m "feat: 名前解決の横取りを追加"
```

---

### Task 5: モーダルとコンテキストメニュー

右クリックからニックネームを付ける・変更する・解除する、という一連の操作を通す。モーダル単体では開く手段が無く検証できないため、両方を1タスクにまとめる。

`@webpack/common` の `Modal` は `title` / `subtitle` / `actions` を受け取る高レベルコンポーネントで、フッターのボタンとEscでの閉じる動作を自前で持っている。

**Files:**
- Create: `NicknameModal.tsx`
- Modify: `index.tsx`

**Interfaces:**
- Consumes: `store.ts` の `getNickname` / `setNickname` / `clearNickname`、`nameOverride.ts` の `getOriginalName`
- Produces: `NicknameModal` コンポーネント（props: `{ user: User; baseName: string; props: RenderModalProps; }`）。`ErrorBoundary.wrap` で包む

- [ ] **Step 1: `NicknameModal.tsx` を実装する**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, TextInput, useState } from "@webpack/common";

import { getNickname, setNickname } from "./store";

interface Props {
    user: User;
    /** 元の表示名。タイトル下の表示と、保存する label に使う */
    baseName: string;
    props: RenderModalProps;
}

const noteStyle = {
    marginTop: "8px",
    fontSize: "12px",
    color: "var(--text-muted)"
} as const;

function NicknameModalInner({ user, baseName, props }: Props) {
    const existing = getNickname(user.id) ?? "";
    const [value, setValue] = useState(existing);

    const save = () => {
        setNickname(user.id, value, baseName);
        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={existing ? "ニックネームを変更" : "ニックネームを付ける"}
            subtitle={baseName}
            actions={[
                { text: "OK", variant: "primary", onClick: save },
                { text: "キャンセル", variant: "secondary", onClick: () => props.onClose() }
            ]}
        >
            {/* TextInput 側の onKeyDown の型が不安定なので、外側の div で拾う */}
            <div onKeyDown={e => { if (e.key === "Enter") save(); }}>
                <TextInput
                    value={value}
                    onChange={setValue}
                    placeholder="ニックネーム"
                    autoFocus
                />
            </div>
            <div style={noteStyle}>空欄のまま OK を押すとニックネームを解除します。</div>
            <div style={noteStyle}>反映されない箇所があれば Ctrl+R で再読み込みしてください。</div>
        </Modal>
    );
}

export const NicknameModal = ErrorBoundary.wrap(NicknameModalInner, { noop: true });
```

- [ ] **Step 2: `index.tsx` にコンテキストメニューを足す**

`index.tsx` を次の内容に置き換える:

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { Menu, openModal, UserStore } from "@webpack/common";

import { applyNameOverrides, getOriginalName, removeNameOverrides } from "./nameOverride";
import { NicknameModal } from "./NicknameModal";
import { clearNickname, getNickname, settings } from "./store";

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    // 自分自身にはニックネームを付けさせない
    if (user.id === UserStore.getCurrentUser()?.id) return;

    const current = getNickname(user.id);
    const baseName = getOriginalName(user);

    const open = () => openModal(props => (
        <NicknameModal user={user} baseName={baseName} props={props} />
    ));

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-local-nickname-set"
                label={current ? "ニックネームを変更" : "ニックネームを付ける"}
                action={open}
            />
            {current && (
                <Menu.MenuItem
                    id="vc-local-nickname-clear"
                    label="ニックネームを解除"
                    action={() => clearNickname(user.id)}
                />
            )}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "LocalNicknames",
    description: "他のユーザーに、自分のクライアント内でのみ有効なニックネームを付けます。サーバーをまたいでも同じ表示になります。",
    authors: [{ name: "penguinwokrs", id: 0n }],
    tags: ["Appearance", "Customisation"],
    settings,
    contextMenus: {
        "user-context": UserContext
    },

    start() {
        applyNameOverrides();
    },

    stop() {
        removeNameOverrides();
    }
});
```

- [ ] **Step 3: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: 終了コード 0。

- [ ] **Step 4: ビルドして配置し、Vesktop を再起動する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
./tools/build.sh && ./tools/deploy.sh
```
Expected: `deployed to /mnt/c/Users/owner/VencordCustom`。その後 Vesktop を再起動する。

- [ ] **Step 5: 一連の操作を確認する（手動）**

1. メンバーリストでユーザーを右クリックする → `ニックネームを付ける` が出る
2. クリックするとモーダルが開き、タイトルが `ニックネームを付ける`、その下に元の名前が出る
3. 名前を入力して `OK` を押す → モーダルが閉じ、**リロードせずに**メンバーリストとメッセージヘッダの表示が変わる
4. もう一度そのユーザーを右クリックする → `ニックネームを変更` と `ニックネームを解除` の2つが出る
5. `ニックネームを変更` を開くと、入力欄に現在のニックネームが入っている
6. 入力欄を空にして `OK` → 標準の表示に戻る
7. もう一度付け直してから `ニックネームを解除` → 標準の表示に戻る
8. `キャンセル` と Esc で、何も変わらずに閉じる
9. 入力して Enter を押すと保存される
10. **自分自身を右クリックしても項目が出ない**
11. 自分の「サーバープロフィールを編集」を開き、ニックネーム欄が書き換わっていない

Expected: 上記すべてが期待通り。Console に `[LocalNicknames]` のエラーが出ていないこと。

- [ ] **Step 6: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add NicknameModal.tsx index.tsx
git commit -m "feat: ニックネームの設定モーダルとコンテキストメニューを追加"
```

---

### Task 6: 設定画面の一覧 `NicknameList.tsx`

保存済みのニックネームを設定画面で一覧し、個別に削除できるようにする。編集は右クリックメニューに一本化するので、ここには置かない。

`definePlugin` の `settingsAboutComponent` はプラグイン設定モーダルの先頭に無条件で描画される（`src/components/settings/tabs/plugins/PluginModal.tsx:234`）。これを使うと `definePluginSettings` に UI 用の項目を足さずに済み、モジュールの循環依存も避けられる。

**Files:**
- Create: `NicknameList.tsx`
- Modify: `index.tsx`

**Interfaces:**
- Consumes: `nickname.ts` の `sortedEntries`、`store.ts` の `settings` / `clearNickname`
- Produces: `NicknameList` コンポーネント（props なし）

- [ ] **Step 1: `NicknameList.tsx` を実装する**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Button, UserStore } from "@webpack/common";

import { sortedEntries } from "./nickname";
import { clearNickname, settings } from "./store";

const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px"
} as const;

function NicknameListInner() {
    const { nicknames } = settings.use(["nicknames"]);
    const entries = sortedEntries(nicknames);

    if (entries.length === 0) {
        return (
            <div style={{ color: "var(--text-muted)" }}>
                まだニックネームは登録されていません。ユーザーを右クリックして「ニックネームを付ける」から登録できます。
            </div>
        );
    }

    return (
        <>
            <div style={{ marginBottom: "8px", fontWeight: 600 }}>保存済みのニックネーム</div>
            {entries.map(entry => {
                // 現在キャッシュに載っていればそちらを優先し、無ければ保存時の名前を使う
                const user = UserStore.getUser(entry.userId);
                const original = user ? (user.globalName || user.username) : entry.label;

                return (
                    <div key={entry.userId} style={rowStyle}>
                        <span style={{ flex: 1 }}>{original} → {entry.nickname}</span>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            onClick={() => clearNickname(entry.userId)}
                        >
                            削除
                        </Button>
                    </div>
                );
            })}
        </>
    );
}

export const NicknameList = ErrorBoundary.wrap(NicknameListInner, { noop: true });
```

- [ ] **Step 2: `index.tsx` に `settingsAboutComponent` を足す**

`index.tsx` の import に1行足す:

```tsx
import { NicknameList } from "./NicknameList";
```

`definePlugin` の `settings,` の直後に1行足す:

```tsx
    settingsAboutComponent: NicknameList,
```

- [ ] **Step 3: 型チェックと lint を通す**

Run:
```bash
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: 終了コード 0。

- [ ] **Step 4: 純粋ロジックのテストが壊れていないことを確認する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames && ./tools/test.sh
```
Expected: `# pass 11` `# fail 0`。

- [ ] **Step 5: ビルドして配置し、Vesktop を再起動する**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
./tools/build.sh && ./tools/deploy.sh
```
その後 Vesktop を再起動する。

- [ ] **Step 6: 設定画面を確認する（手動）**

1. 1件も登録していない状態で、設定 → Plugins → `LocalNicknames` の歯車を開く
2. 「まだニックネームは登録されていません」と出る
3. モーダルを閉じ、ユーザーに2件ニックネームを付ける
4. もう一度設定画面を開く

Expected:
- 「元の名前 → ニックネーム」が元の名前の昇順で2行並ぶ
- `削除` を押すとその行が消え、Discord の表示も標準に戻る
- 残った行はそのまま

- [ ] **Step 7: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add NicknameList.tsx index.tsx
git commit -m "feat: 設定画面にニックネーム一覧を追加"
```

---

### Task 7: README と受け入れ検証

導入手順を残し、設計書の検証項目をすべて通す。

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: これまでの全タスク
- Produces: なし

- [ ] **Step 1: `README.md` を書く**

````markdown
# LocalNicknames

Discord の他ユーザーに、**自分のクライアント内でのみ有効なニックネーム**を付ける Vencord UserPlugin です。

付けたニックネームは、そのユーザーが所属するサーバーを問わず常に同じ表示名として使われます。
サーバー API は一切使いません。ニックネームは他人には見えず、Discord のサーバーにも送信されません。

## 使い方

ユーザーを右クリック → `ニックネームを付ける` → 入力して `OK`。

解除するには、右クリック → `ニックネームを解除`、
またはモーダルの入力欄を空欄のまま `OK` を押します。

保存済みの一覧は 設定 → Plugins → LocalNicknames の歯車から見られます。

## 表示の優先順位

```
ローカルニックネーム > サーバーニックネーム > フレンドニックネーム > 表示名 > ユーザー名
```

## 導入

Vencord にはランタイムのプラグイン読み込み機構が無いため、プラグインを含んだ
Vencord を自分でビルドし、Vesktop にそれを読ませます。

```bash
./tools/setup.sh     # Vencord を clone し、依存を入れ、src/userplugins/ にリンクを張る
./tools/build.sh     # Vencord をビルドする
./tools/deploy.sh    # 成果物を /mnt/c/Users/owner/VencordCustom へ配置する
```

その後 Vesktop の 設定 → **Vencord Location** で `C:\Users\owner\VencordCustom` を指定し、
Vesktop を再起動します。この指定は最初の一度だけで済みます。

クローン先と配置先は環境変数で変えられます。

```bash
VENCORD_DIR=/path/to/Vencord DEPLOY_DIR=/mnt/c/Users/you/VencordCustom ./tools/deploy.sh
```

## 更新

Vencord Location を既定から変更すると、Vesktop 側での Vencord の自動取得は行われなくなります。
更新は次のコマンドで行ってください。

```bash
./tools/update.sh    # Vencord を pull → 再ビルド → 再配置
```

## テスト

純粋ロジックのみ自動テストがあります。

```bash
./tools/test.sh
```

Vencord 側の型チェックと lint:

```bash
cd "$HOME/projects/github.com/Vendicated/Vencord" && pnpm testTsc && pnpm lint
```

## 既知の制約

- Discord の内部実装が変わると、一部またはすべての画面で効かなくなる可能性があります。
  その場合もクラッシュはせず、DevTools の Console に `[LocalNicknames]` の警告が出ます。
- Vencord の SupportHelper は UserPlugin が入っていると診断情報に `Has UserPlugins` を出します。
  これは仕様どおりの挙動で、公式サポートの対象外であることを示します。
- 検索やメンション入力の補完でもニックネームが表示されます。表示のみで、
  サーバーに送信される内容は変わりません。
- `ShowMeYourName` と併用すると、メッセージヘッダは「ニックネーム + 元のユーザー名」の
  併記になります。どちらのプラグインも壊れません。
- Vencord 本体へのコントリビュートはできません。Vencord の `CONTRIBUTING.md` は
  AI が書いたコードの PR を禁止しています。本プラグインはローカル専用として運用します。
````

- [ ] **Step 2: すべての自動検証を通す**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames && ./tools/test.sh
cd ~/projects/github.com/Vendicated/Vencord && pnpm testTsc && pnpm lint
```
Expected: テストが `# pass 11` `# fail 0`、型チェックと lint が終了コード 0。

- [ ] **Step 3: クリーンビルドから配置まで通す**

Run:
```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
rm -rf ~/projects/github.com/Vendicated/Vencord/dist
./tools/build.sh && ./tools/deploy.sh
```
Expected: `deployed to /mnt/c/Users/owner/VencordCustom`。

- [ ] **Step 4: 受け入れ検証を全項目通す（手動）**

Vesktop を再起動し、設計書 11 節の全項目を確認する。

1. 右クリックメニューに項目が出る（メンバーリスト、メッセージ、DM リスト、プロフィールの4か所すべて）
2. モーダルの OK / キャンセル / Esc / Enter が期待通りに動く
3. 保存後、リロードせずにメッセージヘッダとメンバーリストの表示が変わる
4. **別のサーバーで同じユーザーを見ても同じニックネームが出る**（サーバーニックネームが設定されているユーザーで確認すること）
5. DM リスト、ボイスチャンネル、メンション、プロフィールでも置き換わる
6. 空欄で保存すると標準の表示に戻る
7. メニューの「ニックネームを解除」でも標準の表示に戻る
8. 自分自身には項目が出ない。自分のサーバープロフィール編集画面のニックネーム欄が書き換わっていない
9. 設定画面に一覧が出て、削除ボタンが効く
10. Vesktop を再起動しても設定が残っている
11. `ShowMeYourName` との併記表示が壊れていない（「ニックネーム + 元のusername」になる）

通らない項目があれば、その項目番号と実際の挙動を記録して報告する。

- [ ] **Step 5: コミット**

```bash
cd /home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames
git add README.md
git commit -m "docs: README を追加"
```
