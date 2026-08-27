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

### `tools/gen-tsconfig.sh` について

リポジトリ直下に生成される `tsconfig.json` は生成物で、`.gitignore` 済みです。
手元に現れても手で編集したりコミットしたりしないでください。

必要になる理由は Vencord 側のビルド方式にあります。Vencord の esbuild ビルドは、
各ソースファイルの symlink 解決後の実パスから上位ディレクトリへ辿って
`tsconfig.json` を探索します。このリポジトリは Vencord のツリーの外から
`src/userplugins/` へシンボリックリンクされているだけなので、その探索は
Vencord 本体の `tsconfig.json`（`@utils/*` などのパスエイリアスの定義元）まで
辿り着けません。そこで `tools/gen-tsconfig.sh` が、Vencord の実際のパスエイリアスを
指すこのリポジトリ用の `tsconfig.json` をルートに生成し、探索を打ち切らせます。

`tools/setup.sh` と `tools/build.sh` の両方が内部で自動的に呼び出すため、
通常は手動で実行する必要はありません。

既知の制約として、このスクリプトは Vencord のパスエイリアス一覧をハードコードして
ミラーしています。Vencord 本体でエイリアスが追加・改名されると追従できず、その場合は
esbuild が `Could not resolve '@some/alias'` のようなエラーを出します。

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
- `ShowMeYourName` と併用すると、メッセージヘッダにニックネームと元のユーザー名が
  併記されます。順序は ShowMeYourName 側の `mode` 設定に従うため、既定の `user-nick`
  では「ユーザー名 + ニックネーム」、`nick-user` では「ニックネーム + ユーザー名」の
  順になります。どちらのプラグインも壊れません。
- Vencord の Cloud Settings Sync を有効にしている場合、`plugins.LocalNicknames.nicknames`
  を含む設定一式が、設定済みの Vencord クラウドバックエンドへアップロードされます。
  Discord のサーバーではありませんが、対象ユーザーの ID と付けた名前がそこへ送られる
  ことにはなるため、プライバシーを重視するなら Cloud Settings Sync の利用先を
  把握した上で有効にしてください。
- Vencord 本体へのコントリビュートはできません。Vencord の `CONTRIBUTING.md` は
  AI が書いたコードの PR を禁止しています。本プラグインはローカル専用として運用します。

## 実機検証チェックリスト

自動テストではカバーできない部分を、実際に Vesktop 上で確認するためのチェック
リストです。ビルド・配置後、Vesktop を再起動してから確認してください。

1. 右クリックメニューに項目が出る（メンバーリスト、メッセージ、DM リスト、
   プロフィールの4か所すべて）
2. モーダルの OK / キャンセル / Esc / Enter が期待通りに動く
3. 保存後、リロードせずにメッセージヘッダとメンバーリストの表示が変わる
4. 別のサーバーで同じユーザーを見ても同じニックネームが出る（サーバーニック
   ネームが設定されているユーザーで確認すること）
5. DM リスト、ボイスチャンネル、メンション、プロフィールでも置き換わる
6. 空欄で保存すると標準の表示に戻る
7. メニューの「ニックネームを解除」でも標準の表示に戻る
8. 自分自身には項目が出ない。自分のサーバープロフィール編集画面のニックネーム欄
   が書き換わっていない
9. 設定画面に一覧が出て、削除ボタンが効く
10. Vesktop を再起動しても設定が残っている
11. `ShowMeYourName` との併記表示が壊れていない

さらに、以下も確認してください。

- プラグインを有効にした直後に DevTools（Ctrl+Shift+I）の Console を開き、
  `[LocalNicknames]` で始まる警告やエラーが出ていないこと。出ている場合は
  4つの経路のどれが効いていないかがそのメッセージで分かる。
- モーダルの入力欄に1文字入力し、その文字がそのまま表示されること（入力値の
  受け渡しが正しいことの確認）。
- 大きなサーバーのメンバーリストを勢いよくスクロールし、プラグインを無効に
  したときと比べて描画が重くなっていないこと。
