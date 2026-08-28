# 引き継ぎ: LocalNicknames (Equicord UserPlugin)

## これは何

Discord の他ユーザーに、**自分のクライアント内でのみ有効なニックネーム**を付ける Equicord UserPlugin。
サーバー API は使わず、ニックネームは他人には見えない。どのサーバーで見ても同じ表示になることが中核要件。

- リポジトリ: `/home/owner/projects/github.com/penguinwokrs/vencord-local-nicknames`
- ブランチ: `feat/local-nicknames`（`main` 未マージ、27コミット）
- Equicord クローン: `/home/owner/projects/github.com/Equicord/Equicord`
- 配置先: `/mnt/c/Users/owner/EquicordCustom`（Equibop の Equicord Location にこの**親**を指定済み）
- 経緯の台帳: `.superpowers/sdd/progress.md`（gitignored、必読）
- 設計書: `docs/superpowers/specs/2026-08-27-local-nicknames-design.md`

## 最優先バグは解決済み（2026-08-28 実機確認）

モーダルの Enter は**保存も動き、背後のメッセージ入力欄への改行漏れも無い**。実機で確認済み。

以前の引き継ぎは「抑止3行を足したら保存が動かなくなった」としていたが、これは誤検知だった。
検証は次の順で行い、コードは一行も変えていない:

1. デプロイ済み `renderer.js`(08:45:01) がソース `NicknameModal.tsx`(08:43:45) より新しいことを `stat` で確認
2. デプロイ済みバンドルを grep し、抑止3行入りのハンドラが実際に入っていることを確認
3. その上で実機の挙動を確認 → 保存も改行抑止も期待通り

つまり `stopImmediatePropagation()` は React 17+ のイベント集約を壊していない。
**抑止3行は維持すること。`isComposing` ガードも先頭のまま維持すること**（IME 変換は確認済み）。
これでチェックリスト項目2は消化済み。

## アーキテクチャ

**webpack パッチはゼロ。** 6つの関数を実行時ラップするだけ。これが Discord の更新に強い理由で、
維持すべき最重要の性質。比較対象の EditUsers は21個のパッチを持ち壊れやすい。

| ラップ対象 | 効く画面 |
|---|---|
| `UsernameUtils.getName` | DM、プロフィール、フレンド一覧 |
| `UsernameUtils.useName` | 同上（フック経路）。**元のフックを必ず先に無条件で呼ぶこと**（React のフック規則） |
| `GuildMemberStore.getNick` | 一部のギルド画面 |
| `RelationshipStore.getNickname` | フレンドニックネーム経路 |
| `GuildMemberStore.getMember` | **ギルド内の表示全般**（Discord は getNick ではなくこちらを読む） |
| `GuildMemberStore.getMembers` | **@メンション補完の候補リスト** |

`getTrueMember` は**意図的にラップしない**（理由は `nameOverride.ts` のコメント参照）。

ファイル構成（リポジトリのルートがそのままプラグインディレクトリ。`src/` を作ってはいけない）:

- `nickname.ts` — 純粋ロジック。Vencord に非依存。**唯一の単体テスト対象（31件）**
- `store.ts` — 永続化、自分自身の除外、キャッシュ、変更通知
- `nameOverride.ts` — 6つのラップ、WeakMap キャッシュ、復元
- `NicknameModal.tsx` / `NicknameList.tsx` / `index.tsx` — UI

## ビルドと確認

```bash
./tools/test.sh                                   # 31件
cd ~/projects/github.com/Equicord/Equicord && pnpm testTsc && pnpm lint
./tools/build.sh && ./tools/deploy.sh             # 配置まで
```

**配置後は Equibop の完全な再起動が必要。** タスクトレイに常駐するので、プロセスが消えたことを確認すること。

## 重大な教訓（同じ轍を踏まないこと）

1. **「ビルドが通った」は何も保証しない。** 一度、`src/` に誤配置してルートの `index.tsx` が
   スタブのままだったのに、型チェック・lint・ビルド・配置がすべて成功した（プラグインは何もしていなかった）。
   **必ずバンドルを grep して該当コードが入っていることを確認する。**

2. **デプロイ時刻とプロセス起動時刻を照合すること。** 一度、修正前のビルドでのテスト結果を
   「修正が効かなかった」と誤判定した。`stat` と `Get-Process ... StartTime` で確認できる。

3. **推測で直さない。** 実機で見つかった不具合5件はすべて、Console の証拠か Discord のモジュール
   ソースを実際に読んで原因を特定してから直している。`Vencord.Webpack.search("文字列")` で
   Discord 本体のモジュールを検索でき、`String(結果[id])` でソースを読める。これが決定打になった。

4. **ユーザーへの Console 実験は `copy()` で渡す。** 出力の貼り付けで何度か往復が発生した。
   `copy((() => {...})())` にすればクリップボードに入る。

## 実機テストで見つけて直した不具合

1. 2人目以降でモーダルが閉じない — `settings.store` の Proxy が構造化複製できず IPC で例外。
   `settings.plain` から読むよう変更
2. サーバー内で反映されない — Discord は `getNick()` ではなく `getMember().nick` を読んでいた
3. 即時反映されない — `GuildMemberStore` に変更を通知していなかった。3ストアに `emitChange()`
4. メンション補完で検索できない — 候補は `getMembers()` から作られていた
5. Enter がチャット欄に漏れる — 抑止3行を追加して解決（実機確認済み）

いずれも型チェック・lint・複数回のレビューを通過していた。

## 既知の制約（決定済み。TODO ではない）

- **右側メンバーリストは即時更新されない。** チャンネル切替か Ctrl+R で反映。
  **全506ストアに `emitChange()` を送っても変わらないことを検証済み。**
  仮想リストが行データを構築時に確定させているため。行コンポーネントへの webpack パッチで
  直せるが、パッチゼロの利点を失うため**却下済み**。
- **ローカルニックネームが Discord に送信されうる経路がある。** `GuildMemberStore.getNick` と
  `RelationshipStore.getNickname` は Discord 純正のニックネーム編集ダイアログの初期値にも
  使われうる。保存を押すと送信される。ユーザーはリスクを承知の上で受け入れ、README に警告済み。
  **この警告を弱めたり消したりしないこと。**
- フレンドかどうかで分岐しない（設計書 5.1.1 に決定として記録）。`isFriend` 分岐を追加しないこと。
- Vencord/Equicord 双方とも **AI が書いたコードの PR を禁止**している。上流に投げる道は無い。
  ローカル専用の UserPlugin として運用する。

## 残っている確認事項

README の実機検証チェックリスト16項目のうち、以下が未消化:

- **項目4**: 別のサーバーで同じユーザーが同じ表示になるか（**中核要件、最重要**）
- **項目12・13**: フレンド／メンバーのニックネーム編集ダイアログの初期値確認（**開くだけ。保存は絶対に押さない**）
- **項目14〜16**: プラグインの無効化→再有効化→もう一度。復元処理は一度も実行されていない
- @メンション補完がニックネームで検索できるようになったか（修正は配置済み、未確認）

補完が直っていた場合、設計書 §12 の「補完で検索できない」という制約の記述と
「5つの横取り対象」という記述（表は6行に更新済み）を書き換える必要がある。
