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
 * nicknames マップのキャッシュ。settings.store は触るたびに新しい Proxy を組み立てる
 * ため、毎回 settings.store.nicknames を辿ると描画のたびに複数の Proxy を無駄に生成
 * する。一度取得した参照を使い回し、書き込み（setNickname/clearNickname）があった
 * ときだけ無効化する。settings.plain は丸ごと settings が差し替えられる（クラウド同期
 * や設定インポート）と古いまま残ってしまうため使わない
 */
let cachedNicknames: NicknameMap | undefined;

function getNicknameMap(): NicknameMap {
    if (cachedNicknames === undefined) cachedNicknames = settings.store.nicknames;
    return cachedNicknames;
}

function invalidateNicknameCache(): void {
    cachedNicknames = undefined;
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
    const nickname = normalizeNickname(input);
    const next: NicknameMap = { ...settings.store.nicknames };

    if (nickname === null) delete next[userId];
    else next[userId] = { nickname, label };

    settings.store.nicknames = next;
    invalidateNicknameCache();
    notifyUserUpdate(userId);
}

/** ニックネームを解除する。 */
export function clearNickname(userId: string): void {
    const next: NicknameMap = { ...settings.store.nicknames };
    delete next[userId];

    settings.store.nicknames = next;
    invalidateNicknameCache();
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
