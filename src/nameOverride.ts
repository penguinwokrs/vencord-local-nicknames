/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildMemberStore, RelationshipStore, UsernameUtils } from "@webpack/common";

import { getNickname } from "../store";

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
