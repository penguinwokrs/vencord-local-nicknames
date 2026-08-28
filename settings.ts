/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { GuildMemberStore, RelationshipStore, UserStore } from "@webpack/common";

import { lookupNickname, NicknameMap, withNickname, withoutNickname } from "./utils";

export const settings = definePluginSettings({
    nicknames: {
        type: OptionType.CUSTOM,
        description: "Map of local nicknames, keyed by user ID",
        default: {} as NicknameMap
    }
});

/**
 * nicknames マップのキャッシュ。settings.store は触るたびに新しい Proxy を組み立てる
 * ため、毎回 settings.store.nicknames を辿ると描画のたびに複数の Proxy を無駄に生成
 * する（設計 §5.3）。そのため読み取りには `settings.plain.nicknames`（Proxy を経由
 * しない生のオブジェクト）を使い、一度取得した参照を使い回して、書き込み
 * （setNickname/clearNickname）があったときだけ無効化する。
 *
 * このキャッシュが古くなりうる窓が一つだけある。設定インポート（`importSettings` /
 * `src/api/SettingsSync/offline.ts`）とクラウド同期のダウンロードは、いずれも
 * `Object.assign(PlainSettings, parsed.settings)` でルートオブジェクトをその場で
 * 書き換えるだけで、`settings.plain` 自体を差し替えることはない。レンダラー側の
 * `SettingsStore` は `readOnly: true` で構築されており `setData`（丸ごと差し替え）は
 * 呼ばれた瞬間に例外を投げるため、その経路は原理的に発生しない。したがって
 * `settings.plain.nicknames` を毎回読み直せばインポート後もクラウド同期後も最新の
 * 値になるが、このモジュールレベルのキャッシュだけは差し替え前の参照を持ち続けて
 * しまう。プラグインが無効化されている間にインポートや同期が起きるとこの窓に
 * 入るため、start() で invalidateNicknameCache() を呼んで読み直しを強制する
 */
let cachedNicknames: NicknameMap | undefined;

function getNicknameMap(): NicknameMap {
    if (cachedNicknames === undefined) cachedNicknames = settings.plain.nicknames;
    return cachedNicknames;
}

/** nicknames マップのキャッシュを無効化する。index.tsx の start() からも呼ばれる */
export function invalidateNicknameCache(): void {
    cachedNicknames = undefined;
}

/**
 * 現在の nicknames マップの参照をそのまま返す。getNickname と同じ
 * getNicknameMap() を経由するため、返る参照は getNickname が内部で読んでいる
 * ものと常に一致する。index.tsx の getMembers 配列キャッシュが「前回
 * ビルド時点からニックネームの内容が変わっていないか」を判定するためだけに
 * 公開するアクセサで、setNickname/clearNickname は必ず新しいプレーン
 * オブジェクトを作ってから invalidateNicknameCache() → 代入する（このモジュール
 * 内の他の関数の実装を参照）ため、内容に変更があれば参照も必ず変わる。
 * 変更が無ければ同じ参照を返し続ける。
 *
 * getNickname 同様、@ メンションのオートコンプリートなど描画の内周から呼ばれうる
 * ため例外を外へ出さない。読み取りに失敗した場合は誰とも一致しない新しい空
 * オブジェクトを返す。これにより呼び出し側の配列キャッシュは常にミスしてキャッシュ
 * を使わなくなるだけで、個々の getNickname 自体は自前の try/catch で安全に失敗する
 */
export function getNicknameMapRef(): NicknameMap {
    try {
        return getNicknameMap();
    } catch {
        return {};
    }
}

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

        return lookupNickname(getNicknameMap(), userId);
    } catch {
        return null;
    }
}

/**
 * ニックネームを保存する。入力が空欄・空白のみなら削除（＝解除）になる。
 * label には保存時点で見えていた元の表示名を渡す。
 */
export function setNickname(userId: string, input: string, label: string): void {
    // source は settings.plain（Proxy を経由しない生のオブジェクト）。settings.store
    // から読むと各エントリが SettingsStore の get トラップで Proxy にラップされ、
    // withNickname が組み直した先のマップにその Proxy が値として紛れ込むと、
    // 後続の VencordNative.settings.set（structured clone）が
    // 「An object could not be cloned」で例外を投げてしまう
    const next = withNickname(settings.plain.nicknames, userId, input, label);

    // settings.store への代入は同期的にリスナーへ通知する。対象オブジェクトは
    // 代入前の時点で既に更新済みなので、リスナーが同期的に再描画して
    // getNickname を呼んでも古いキャッシュを読まないよう、代入より先に無効化する
    invalidateNicknameCache();
    settings.store.nicknames = next;
    notifyNicknameChange();
}

/** ニックネームを解除する。 */
export function clearNickname(userId: string): void {
    // source を settings.plain にする理由は setNickname と同じ
    const next = withoutNickname(settings.plain.nicknames, userId);

    // 理由は setNickname と同じ（代入前に無効化して同期リスナーからの読み直しに備える）
    invalidateNicknameCache();
    settings.store.nicknames = next;
    notifyNicknameChange();
}

/**
 * 描画済みの要素を更新させるため、読み取りを横取りしている各 Flux ストアへ
 * 「変化した」と伝える。実データには一切触れず、各ストアの emitChange() を
 * 呼んでバッチ済みリスナーへ再描画を促すだけの、純粋にクライアント側だけの
 * 通知。Discord のサーバーへは何も送信されない。
 *
 * 対象は getNick/getMember を横取りしている GuildMemberStore、getNickname を
 * 横取りしている RelationshipStore、そして UsernameUtils.getName/useName の
 * 呼び出し元コンポーネントの多くが購読している UserStore の3つ。1つの emitChange
 * が失敗しても他のストアの通知が止まらないよう、それぞれ個別に try/catch で保護する
 */
function notifyNicknameChange(): void {
    try {
        UserStore.emitChange();
    } catch (e) {
        console.error("[LocalNicknames] UserStore.emitChange の発火に失敗しました", e);
    }

    try {
        GuildMemberStore.emitChange();
    } catch (e) {
        console.error("[LocalNicknames] GuildMemberStore.emitChange の発火に失敗しました", e);
    }

    try {
        RelationshipStore.emitChange();
    } catch (e) {
        console.error("[LocalNicknames] RelationshipStore.emitChange の発火に失敗しました", e);
    }
}
