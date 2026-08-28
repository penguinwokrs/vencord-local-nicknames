# LocalNicknames 設計書

作成日: 2026-08-27

## 1. 目的

Discord の他ユーザーに対して、**自分のクライアント内でのみ有効なニックネーム**を付けられるようにする。
付けたニックネームは、そのユーザーが所属するサーバーを問わず、常に同じ表示名として使われる。

サーバー API は一切使わない。ニックネームは他人には見えず、Discord のサーバーにも送信されない。

## 2. 非目標

- ニックネームの他端末との同期（設定ファイルを手動でコピーすれば可能だが、機能としては提供しない）
- 自分自身へのニックネーム付与
- ニックネームの一括インポート／エクスポート UI
- 設定画面からのニックネーム編集（編集は右クリックメニューに一本化する）

プラグイン名（Vencord の設定画面やプラグイン一覧に出る識別子）は `LocalNicknames` とする。

## 3. 動作仕様

### 3.1 ニックネームを付ける

1. ユーザーを右クリックする（メンバーリスト、メッセージのアイコンや名前、DM リスト、プロフィールのいずれでも同じメニューが出る）
2. コンテキストメニューの `ニックネームを付ける` をクリックする
3. モーダルが開く。テキスト入力欄と、フッターに `キャンセル` `OK` の2つのボタンがある
4. ニックネームを入力して `OK` を押すと保存され、その場で表示名が置き換わる
5. `キャンセル` または Esc で何もせず閉じる

すでにニックネームが設定されているユーザーでは、メニューの項目が `ニックネームを変更` になり、モーダルの入力欄には現在のニックネームがプリフィルされる。

### 3.2 ニックネームを解除する

以下のいずれでも、保存が削除され Discord 標準の表示に戻る。

- 右クリックメニューの `ニックネームを解除`（設定済みのユーザーにのみ表示される）
- モーダルの入力欄を**空欄のまま** `OK` を押す（前後の空白のみの場合も空欄として扱う）

### 3.3 表示の優先順位

ローカルニックネームは、Discord が持つあらゆる名前より優先される。

```
ローカルニックネーム  >  サーバーニックネーム  >  フレンドニックネーム  >  表示名  >  ユーザー名
```

サーバーごとの分岐を一切持たないため、「どのサーバーで見ても同じ表示になる」ことが構造的に保証される。

## 4. リポジトリ構成と導入

### 4.1 構成

Vencord のサードパーティプラグイン（UserPlugin）の慣習に従い、**リポジトリのルートがそのままプラグインディレクトリ**になる。

```
vencord-local-nicknames/
├── index.tsx                   プラグイン定義、コンテキストメニュー、プロフィールセクションの登録
├── nickname.ts                 純粋ロジック（Vencord に非依存。単体テストの対象はここだけ）
├── store.ts                    ニックネームの読み書き、自分自身の除外、キャッシュ、変更通知
├── nameOverride.ts             名前解決の横取り（6つの関数の実行時ラップ）と復元
├── NicknameModal.tsx           入力モーダル
├── NicknameList.tsx            設定画面の一覧 + 削除 UI
├── NicknameProfileSection.tsx  プロフィールに元の名前とニックネームを並べて出すセクション
├── README.md                   導入手順
├── docs/                       設計書など
└── tools/
    ├── setup.sh                Equicord を clone し、依存を入れ、本リポジトリを配置する
    ├── gen-tsconfig.sh         Equicord のパスに合わせて tsconfig.json を生成する
    ├── build.sh                Equicord をビルドする
    ├── deploy.sh               成果物を Equibop の参照先へコピーする
    ├── update.sh               Equicord を更新して再ビルド・再配置する
    ├── test.sh                 nickname.ts の単体テストを走らせる
    └── nickname.test.mjs       その単体テスト
```

**ルートに `package.json` を置かない。** Vencord のビルドはプラグインディレクトリを
`import p from "./userplugins/vencord-local-nicknames"` の形で読み込むため、そこに `package.json` が
あると Node の解決規則で `main` フィールドが先に評価され、`index.tsx` に到達できなくなる恐れがある。
ビルド関連はすべて `tools/` 配下のシェルスクリプトとして持つ。

### 4.2 なぜ「プラグイン単体の成果物」にできないのか

Vencord にはランタイムのプラグイン読み込み機構が存在しない。ビルド時に
`scripts/build/common.mjs` が `src/plugins` と `src/userplugins` を走査し、import 文を生成して
単一のバンドルに固める。Vesktop 側も、読むのは決め打ちの4ファイルだけである。

したがって**成果物は必然的に「本プラグインを含んだ Vencord のビルド一式」**になる。

### 4.3 ビルドと配置

```
tools/setup.sh    →  ~/projects/github.com/Vendicated/Vencord を clone、pnpm install、
                     src/userplugins/vencord-local-nicknames から本リポジトリへ
                     シンボリックリンクを張る
tools/build.sh    →  pnpm build --standalone --disable-updater
                     dist/ に vencordDesktopMain.js / vencordDesktopPreload.js /
                     vencordDesktopRenderer.js / vencordDesktopRenderer.css が出る
tools/deploy.sh   →  上記4ファイルと、中身が {} の package.json を配置先へコピー
```

本リポジトリは `src/userplugins/` にコピーせず**シンボリックリンク**で参照する。
編集した内容が即座にビルドへ反映され、二重管理にならないため。
Vencord のプラグイン走査は `readdir` の結果に対して `isDirectory()` を検査せず、
ディレクトリ名から import 文を組み立てるだけなので、シンボリックリンクで問題なく解決される
（`scripts/build/common.mjs`）。

`--standalone --disable-updater` を付けるのは、Vencord 内蔵のアップデータが
（git リポジトリを同梱しない配置形態では動作しないため）無用なエラーを出さないようにするため。

配置先は Windows 側の固定ディレクトリ（既定: `C:\Users\owner\VencordCustom`）とし、
Vesktop の 設定 → Vencord Location にこのディレクトリを一度だけ指定する。

Vesktop はこのディレクトリに `package.json` と上記4ファイルが揃っているかだけを検証し、
揃っていれば起動時には何もしない。

### 4.4 更新

`tools/update.sh` が Vencord の `git pull` → 再ビルド → 再配置を1コマンドで行う。

Vesktop の Vencord Location を既定から変更すると、Vesktop 側の自動取得は行われなくなる。
ただし Vesktop の起動処理は「ファイルが揃っていれば何もしない」という実装であり、
既定のままでも起動ごとに Vencord が更新されるわけではないため、失われるものは限定的である。

## 5. アーキテクチャ

### 5.1 中核: 名前解決の横取り

Discord 側の名前の供給源をすべてラップし、ローカルニックネームがあれば必ずそれを返す。
webpack patch は使わず、実行時に関数を差し替える。

| ラップ対象 | 取得元 | 主に効く画面 |
| --- | --- | --- |
| `UsernameUtils.getName(user)` | `@webpack/common` | DM リスト、メンション、プロフィール、フレンド一覧 |
| `UsernameUtils.useName(user)` | `@webpack/common` | 同上（React フック経路） |
| `GuildMemberStore.getNick(guildId, userId)` | `@webpack/common` | メンバーリスト、メッセージヘッダ、ボイスチャンネル（の一部） |
| `RelationshipStore.getNickname(userId)` | `@webpack/common` | フレンドニックネームが効く箇所 |
| `GuildMemberStore.getMember(guildId, userId)` | `@webpack/common` | ギルド内の表示全般（メンバーリスト、メッセージヘッダなど） |
| `GuildMemberStore.getMembers(guildId)` | `@webpack/common` | @ メンションのオートコンプリートの候補元（`queryGuildUsers` がこれをフィルタしている） |

`UsernameUtils` は `findByPropsLazy("useName", "getGlobalName")` で解決される
モジュールで、`getName` / `useName` / `getGlobalName` / `getFormattedName` /
`getUserTag` / `useUserTag` を持つ。

#### なぜ `getNick` だけでは不十分か

`getNick` をラップしても、ギルド内の表示の一部には反映されない。実機で2ユーザーを
突き合わせたところ、`getNick(guildId, userId)` は両者ともローカルニックネームを正しく
返していたが、`getMember(guildId, userId).nick`（サーバーニックネームが無いユーザーでは
`null`）を直接読む画面はローカルニックネームにもサーバーニックネームにもフォール
バックせず、Discord 本来の表示のままだった。つまりギルド内の一部の表示経路は
`getNick` を経由せず、`getMember` が返すメンバーオブジェクトの `nick` フィールドを
直接読んでいる。そのため `getMember` 自体もラップし、返すメンバーオブジェクトの
`nick` をローカルニックネームで差し替える必要がある。

`getMember` は描画中に大量に呼ばれるため、元の値を変更しない場合（member が無い、
またはローカルニックネームが無い場合）は元のオブジェクトをそのまま返し、参照の
同一性を壊さない。差し替えが必要な場合も、元のメンバーオブジェクトをキーにした
`WeakMap` でコピーをキャッシュし、同じ入力に対して同じコピーを返す（詳細は
`nameOverride.ts` の `getMemberWithNick` を参照）。

#### なぜ `getMember`（単数）だけでも不十分か（`getMembers`）

@ メンションのオートコンプリートは `getNick` も `getMember`（単数）も経由しない。
実行中のクライアントからモジュールソースを直接抽出して確認したところ、候補生成
（`queryGuildUsers`）は次のようになっている（変数名は難読化されたまま）。

```js
queryGuildUsers(e) {
    let { guildId: t, query: n, limit: i = 10, ... } = e;
    if (null == F.A.getGuild(t)) return [];
    ...
    let o = x.Ay.getMembers(t).filter(eS);          // x.Ay は GuildMemberStore
    return r && n.length > 0 && X.A.requestMembers(t, n, i),
    eC({ query: n, members: o, limit: i, ... })     // eC が名前のマッチングを行う
}
```

候補の元データは `GuildMemberStore.getMembers(guildId)` が返すギルドの全メンバー
配列そのもので、事前構築された検索インデックス（`searchable` のような項目）は
このモジュール内に無く、クエリのたびにストアから読み直している。つまり `getMembers`
が返すメンバーオブジェクトの `nick` を差し替えれば、ランタイムラップだけでマッチング
対象に届く。そのため `getMembers` 自体もラップ対象に加える。

`getMembers` はギルドの全メンバーを返し、オートコンプリートは入力のたびにこれを
呼ぶため、`getMember`（単数）以上に呼び出し頻度・データ量の両面でパフォーマンスに
気を配る必要がある。差し替えが必要な要素は `getMember` と同じ `getMemberWithNick`
（`WeakMap` キャッシュ）を再利用し、`getMember` 経由でも `getMembers` 経由でも同じ
メンバーには同じ参照済みコピーが返るようにする。加えて配列自体も `WeakMap` で
キャッシュする（元の配列をキーに、差し替え後の配列と、それを構築した時点の
nicknames マップの参照を保持する）。nicknames マップは `setNickname`/`clearNickname`
のときだけ新しい参照に置き換わる（`store.ts`）ため、参照が前回と同じなら中身も
変わっていないと判定でき、キャッシュを安全に再利用できる。差し替えが1件も無い
場合は、この配列キャッシュの構築自体をせず元の配列をそのまま返す（詳細は
`nameOverride.ts` の `getMembersWithNicks` / `membersArrayCache` / `store.ts` の
`getNicknameMapRef` を参照）。

`GuildMemberStore.getTrueMember` は意図的にラップしない。こちらは「本物の、加工
されていないメンバー」を返すアクセサで、Discord 純正の「ニックネームを変更」
ダイアログの取得元になりうる。`getMember` / `getMembers` をここまでラップしても
なお、ローカルニックネームが Discord サーバーへ送信されうるリスク（README の
既知の制約を参照）をこれ以上広げないため、あえて手を付けない。

ラップは以下の形を取る。

```
const original = target[method];
target[method] = function (...args) {
    const nickname = resolveNickname(extractUserId(args));
    if (nickname != null) return nickname;
    return original.apply(this, args);
};
```

`useName` はフックだが、ニックネームがある場合でもフックの呼び出し順序を壊さないよう
**必ず先に元のフックを呼んでから**戻り値を差し替える。

`stop()` で全てのラップを元に戻す。

### 5.1.1 設計判断: フレンドかどうかで分岐しない

検討した代替案として、フレンドには Discord 組み込みのフレンドニックネーム機能を
使わせ、本プラグインはフレンドでないユーザーにのみ効かせる、という分岐がある。
これは採用しない。理由は次の5つ。

1. Discord のフレンドニックネームはギルド内には反映されない（ギルド内はサーバー
   ニックネームかグローバル名が使われる）。これはまさに本ドキュメントの5.1で
   修正した不具合そのものであり、分岐を入れると「どのサーバーで見ても同じ表示」
   という本プラグインの中核要件をフレンドについてだけ満たせなくなる。
2. フレンド関係は可変である。フレンドの追加・削除だけで表示名の出どころが
   静かに切り替わり、ユーザーの意図しないタイミングで表示が変わってしまう。
3. ニックネームの設定・解除の手段が2系統になり、相手ごとにどちらを使ったかを
   覚えておく必要が生じる。
4. Discord のフレンドニックネームは Discord のサーバーへ送信され端末間で同期
   される。これは本プラグインの「ローカル完結」という前提と矛盾する。
5. 経路が2つに分かれると、以後のあらゆる不具合報告がまず「どちらの経路か」の
   切り分けから始まることになる。

したがって、名前解決の経路に `isFriend` / `RelationshipStore.isFriend` のような
分岐を**今後も追加してはならない**。全ユーザーを均一に扱う、というのが本プラグインの
設計判断である（フレンドニックネームの同期自体を機能として提供しないことは
2章の非目標に既に記載の通りで、ここではその上でなぜ分岐という妥協案も取らないか
を明文化している）。

なお `RelationshipStore.getNickname` のラップ自体は本判断とは別の話であり、
現状維持とする。このラップを外すべきかどうかは、Discord のフレンド「ニックネームを
編集」ダイアログが実際にこれをプリフィル元にしているかという、まだ実施していない
実機確認に依存する未解決の別問題であり、本ドキュメントではその結論を先取りしない。

### 5.2 自分自身の除外

`UserStore.getCurrentUser().id` と一致するユーザーには、ニックネームを適用しない。

`GuildMemberStore.getNick` は「サーバープロフィールを編集」ダイアログのニックネーム欄の
初期値にも使われる。ここを書き換えると、自分のサーバーニックネームを意図せず
上書き送信する事故が起きうるため、明示的に除外する。

コンテキストメニューにも、自分自身に対しては項目を出さない。

### 5.3 パフォーマンス

`resolveNickname` は毎フレーム大量に呼ばれる。設定オブジェクトへの参照を保持し、
`Record<userId, ...>` の単純なキー参照1回で済ませる。走査やコピーは行わない。

### 5.4 メンバーリスト（右側）だけ即時反映されない

8章で述べた `emitChange()` による通知は、メッセージヘッダ・DM リスト・フレンド一覧・
プロフィールには効くが、メンバーリスト（右側）には効かない。ニックネームを付けた・
解除した直後もメンバーリストは古い表示のままで、別チャンネルへの切り替えか Ctrl+R の
リロードでメンバーリストが再構築されて初めて正しい表示になる。

**実施した検証。** 「通知すべきストアが他にあるのではないか」という仮説を検証する
ため、実機で Flux の**全506ストアに対して一括で `emitChange()` を呼ぶ**テストを
行った。結果、メンバーリストの表示は変わらなかった。つまりこれはストアの取りこぼし
の問題ではない。Discord のメンバーリストは仮想化リスト（virtualized list）であり、
各行のデータ（表示名を含む）はリストの構築時に一度だけ計算され、ストアの変更通知を
購読して再計算する作りにはなっていない。横取り自体は正しく動作しており（`getNick` /
`getMember` は両方とも正しいローカルニックネームを返している）、欠けているのは
リストの再構築を起動するトリガーだけである。

今後この問題に取り組む場合、通知対象ストアを追加する方向の修正は無意味である。
506ストア全てへの通知で再現しなかった以上、他のどのストアを1つ追加したところで
解決しない。

**検討して見送った対応。** メンバーリストの行コンポーネントを webpack patch で
直接書き換える案を検討した。対象コンポーネントは `"#{intl::GUILD_OWNER}),children:"`
という文字列で findable であり、Equicord 本体の `MemberListDecorators` API も
同じコンポーネントを patch している。

この案は意図的に見送った。採用すると、本プラグインにとって最初の webpack patch に
なる。2章・4.2節で述べた通り、webpack patch を一切使わないことこそが Discord 側の
内部実装変更に対する耐性の主な根拠であり、patch を1つ導入すればその耐性を、
数秒程度の反映遅延の解消と引き換えにすることになる。反映の遅延はチャンネル切り替え
かリロードで解消でき、かつメンバーリスト以外の全画面は即時反映されているため、
影響は軽微と判断し、patch なしの方針を維持する。

## 6. データモデルと保存

`definePluginSettings` の `OptionType.CUSTOM` として保持する。
実体は Vesktop の `settings.json` の `plugins.LocalNicknames.nicknames` に平文 JSON で入るため、
ファイルを直接見てバックアップや編集ができる。

```ts
type NicknameEntry = {
    nickname: string;
    label: string;   // 保存時点で見えていた元の表示名。設定画面の一覧で「誰か」を示すため
};

type NicknameMap = Record<string /* userId */, NicknameEntry>;
```

`label` を持つのは、設定画面を開いた時点でそのユーザーが Discord 側のキャッシュに
載っているとは限らないため。載っていればそちらを優先して表示し、なければ `label` を使う。

空文字列・空白のみのニックネームは保存しない。保存操作としてはエントリの削除になる。

## 7. UI

### 7.1 コンテキストメニュー

`definePlugin` の `contextMenus: { "user-context": ... }` を使う。
`user-context` はメンバーリスト、メッセージ、DM リスト、プロフィールで共通のメニュー ID であり、
1つ登録すればすべての場所に出る。

- 未設定: `ニックネームを付ける`
- 設定済み: `ニックネームを変更` と `ニックネームを解除` の2項目
- 自分自身: 何も出さない

### 7.2 モーダル

`openModal` と `ModalRoot` / `ModalHeader` / `ModalContent` / `ModalFooter` /
`ModalCloseButton` を使う。

- ヘッダー: `ニックネームを付ける`（変更時は `ニックネームを変更`）と閉じるボタン
- コンテンツ: 対象ユーザーの現在の表示名、`TextInput`（初期値は 7.2.1、オートフォーカス）、
  「空欄で保存するとニックネームを解除します」「反映されない箇所があれば Ctrl+R で再読み込みしてください」の注記
- フッター: `キャンセル`（副次的な見た目）と `OK`（主要な見た目）
- Enter で OK、Esc でキャンセル

### 7.2.1 入力欄の初期値

既にニックネームが付いている相手ではそのニックネームを、まだ付いていない相手では
**元の表示名**を初期値にする。付けるときに元の名前を打ち直させず、そこから編集
できるようにするため。判定は `nickname.ts` の `initialNicknameInput` に置く純粋関数で、
単体テストの対象。

元の表示名が空の場合は空欄のままにする。空欄で `OK` を押すと解除になるので、
実質「何もしない」に落ちる（3.2 と整合する）。

### 7.3 設定画面

`OptionType.COMPONENT` で一覧を描画する。

各行は「元の名前 → ニックネーム」と削除ボタン。1件も無いときは空状態の文言を出す。
編集は行わない（右クリックメニューに一本化する）。

### 7.4 プロフィールのセクション

ニックネームを付けると元の名前が画面上のどこにも出なくなるため、プロフィールに
`ローカルニックネーム` セクションを出し、`元の名前` と `ニックネーム` を並べて表示する。

Equicord の `ProfileSectionsAPI` を使う。プラグイン定義に `renderProfileSection` と
`dependencies: ["ProfileSectionsAPI"]` を書くだけで、登録と解除は `PluginManager` が
行う（`src/api/PluginManager.ts` の 295 行目で登録、375 行目で解除、433 行目で API
プラグインの自動有効化）。**本プラグイン自身は webpack patch を持たない**。patch は
Equicord 側の `src/equicordplugins/_api/profileSections.ts` にあり、DM の右サイドバー、
プロフィールのモーダル、モーダル v2 の3か所へ挿入される（いずれも「Discord 登録日」
付近）。先例は Equicord 同梱の `voiceStats`。

元の表示名は `user.globalName || user.username` と、user オブジェクトの生データから
取る。ここは `getName` 系のラップを通らないため、ニックネームではなく本来の名前が
得られる。ユーザーがキャッシュに載っていない場合は保存済みの `label`（`lookupLabel`）
へ、それも無ければ userId へ落とす。ニックネームが付いていない相手にはセクション
自体を出さない。

## 8. 変更の即時反映

保存・解除の直後に、読み取りを横取りしている各 Flux ストアの `emitChange()` を
呼んで再描画を促す。

```ts
UserStore.emitChange();
GuildMemberStore.emitChange();
RelationshipStore.emitChange();
```

以前は `FluxDispatcher.dispatch({ type: "USER_UPDATE", user })` という合成アクションを
流していたが、これは `UserStore` を揺らすだけで、メンバーリストやメッセージヘッダが
実際に購読している `GuildMemberStore` には何も伝わらなかった。`getNick` / `getMember` を
横取りしているのはまさにその `GuildMemberStore` であり、そこへ変化が伝わらない限り
これらの画面は再読み込みするまで古い名前を表示し続けてしまう（これが実際に報告された
不具合の原因）。加えて、`FluxDispatcher.dispatch` は Discord 自身のレデューサーへ偽の
アクションを注入するものであり、リスナーの中から呼ぶと「dispatch の最中に dispatch
できない」例外を招きうる。

`emitChange()` は Flux ストア自身に用意されている「バッチ済みリスナーへ変化を通知する」
ためのメソッドで、データそのものには一切触れず、レデューサーも経由しない。読み取りを
横取りしている3つのストア——`getNick`/`getMember` を横取りしている `GuildMemberStore`、
`getNickname` を横取りしている `RelationshipStore`、`UsernameUtils.getName`/`useName` の
呼び出し元の多くが購読している `UserStore`——それぞれへ個別に呼ぶことで、各ストアを
購読しているコンポーネントに「読み直して」と伝える。実データは一切書き換えないため、
このディスパッチ・emitChange のいずれもサーバーへの送信は発生しない。呼び出しは
個別に try/catch で保護されており、いずれか1つが失敗しても残りの通知は止まらない。

これでもメンバーリスト（右側）だけは追従しない。詳細と、なぜこれ以上ストア通知を
増やしても解決しないかは 5.4 を参照。モーダルには「反映されない箇所があれば
Ctrl+R」の注記を置く。

## 9. ShowMeYourName との併用

`ShowMeYourName` は有効のまま併用する（現在の設定は `mode: "nick-user"`）。

同プラグインはメッセージヘッダを patch して「ニックネーム + ユーザー名」を併記する。
本プラグインは `GuildMemberStore.getNick` をラップして「ニックネーム」側に入るため、
メッセージヘッダの表示は次のようになる。

```
<付けたニックネーム>  <元のusername>
```

元の名前が横に残るので実用上は都合がよい。どちらのプラグインも壊れない。

メッセージヘッダ以外（メンバーリスト、DM リスト、ボイスチャンネルなど）は
`ShowMeYourName` の対象外なので、ローカルニックネームのみが表示される。

## 10. エラーハンドリング

- ラップ対象のモジュールが見つからない場合は、そのラップだけを諦めてログを出し、
  他のラップとプラグイン自体は動作を続ける。Discord の内部変更で一部の画面だけ
  効かなくなっても、全体が落ちないようにする。
- `resolveNickname` の内部で例外が出た場合は `null` を返し、元の関数の結果に委ねる。
  名前解決は描画の最内周なので、ここで throw させない。
- 設定画面と モーダルは `ErrorBoundary` で包む。
- 保存データが壊れた形（想定外の型）だった場合は、その エントリを無視する。

## 11. 検証方針

Vencord には自動テストの仕組みが無いため、検証は実機での目視確認になる。

自動で確認できるもの:

- `pnpm build --standalone --disable-updater` が成功すること
- TypeScript の型チェックが通ること
- ESLint が通ること

実機で確認すべき項目（手順を README に置く）:

1. 右クリックメニューに項目が出る（メンバーリスト、メッセージ、DM リスト、プロフィール）
2. モーダルの OK / キャンセル / Esc / Enter が期待通りに動く
3. 保存後、リロードせずにメッセージヘッダの表示が変わる（メンバーリストは 12 で
   述べる既知の制約により対象外。切り替え・リロードで直ることを確認する）
4. **別のサーバーで同じユーザーを見ても同じニックネームが出る**（サーバーニックネームが
   設定されているユーザーで確認すること）
5. DM リスト、ボイスチャンネル、メンション、プロフィールでも置き換わる
6. 空欄で保存すると標準の表示に戻る
7. メニューの「ニックネームを解除」でも標準の表示に戻る
8. 自分自身には項目が出ない。自分のサーバープロフィール編集画面のニックネーム欄が
   書き換わっていない
9. 設定画面に一覧が出て、削除ボタンが効く
10. Vesktop を再起動しても設定が残っている
11. `ShowMeYourName` との併記表示が壊れていない

## 12. 既知の制約とリスク

- **Discord の内部実装変更で壊れうる。** `UsernameUtils` などは Vencord が webpack から
  発見しているモジュールであり、Discord 側の変更で見つからなくなる可能性がある。
  その場合は 10 の方針により静かに機能が効かなくなる（クラッシュはしない）。
- **Vencord 本体の自動更新の対象外になる。** `tools/update.sh` で手動更新する。
- **公式へのコントリビュートはできない。** Vencord の `CONTRIBUTING.md` は AI が書いた
  コードの PR を明確に禁止しており、違反は永久ブロックとされている。本プラグインは
  ローカル専用の UserPlugin として運用する。
- **サポート対象外の印が付く。** Vencord の SupportHelper は UserPlugin が入っていると
  診断情報に `Has UserPlugins` の警告を出す。これは仕様であり、想定通りの挙動。
- **メンバーリスト（右側）だけ即時反映されない。** 5.4 で述べた通り、実機で全506
  Flux ストアに一括で `emitChange()` を呼んでも変化せず、原因はストア通知の不足では
  なく、メンバーリストが仮想化リストで行データをリスト構築時にしか計算しない構造に
  ある。メンバーリスト行コンポーネントへの webpack patch（`"#{intl::GUILD_OWNER}),
  children:"` で findable。Equicord の `MemberListDecorators` も同じ対象を patch
  している）で直すことは可能だが、本プラグインの patch なし方針を崩すことになる
  ため、5.4 に記載の通り意図的に見送っている。ワークアラウンドはチャンネル切り替え
  かリロード。
- **@ メンション入力の候補は、ローカルニックネームで検索できる（解決済み）。**
  本節はかつて二度書き換えている。最初は「検索・メンション補完でもニックネームが
  表示される」と記載していたが、実機確認で誤りと判明して「ニックネームでは探せない」
  に訂正し、その後この制約自体を解消したため現在の記述になっている。
  解消の経緯: 実行中のクライアントから Discord のモジュールソースを取り出したところ、
  候補生成（`queryGuildUsers`）は事前構築された検索インデックスではなく、
  `GuildMemberStore.getMembers(guildId)` が返すギルド全メンバー配列をクエリのたびに
  読み直してフィルタしていることが分かった。したがって `getMembers` をラップして
  `nick` を差し替えれば届く。webpack patch は不要で、patch なし方針は維持されている
  （5.1 の表の6つ目）。実機で検索できることを確認済み。
- **Discord 純正のニックネーム編集ダイアログには、ローカルニックネームは入力値として
  入らない（実機確認済み）。** フレンドの「ニックネームを編集」とサーバーメンバーの
  「ニックネームの変更」の両方を、ローカルニックネームを付けた相手に対して開いて
  確認した。入力値は空のままで、ラップ済みの `GuildMemberStore.getNick` や
  `RelationshipStore.getNickname` は読まれていない（読まれていれば空にならなかった）。
  ただし**プレースホルダーには本プラグイン有効時にローカルニックネームが表示される**
  （無効時は本来の表示名）。プレースホルダーは送信されないため、これ自体に送信リスクは
  ない。README の送信リスク警告は、利用者が入力して保存した場合について述べたもので
  あり、この観測によって撤回されるものではない。
