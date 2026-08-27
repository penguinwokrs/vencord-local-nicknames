/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildMemberStore, RelationshipStore, UsernameUtils } from "@webpack/common";

import { withMemberNick } from "./nickname";
import { getNickname } from "./store";

type AnyFn = (...args: any[]) => any;

/**
 * GuildMemberStore.getMember が返すメンバーオブジェクトの、nick 差し替え済みコピーの
 * キャッシュ。元のメンバーオブジェクトをキーにし、そのコピーがどの nickname で
 * 作られたかを一緒に持つ。getMember は描画中に大量に呼ばれるため、同じ入力に対して
 * 毎回新しいオブジェクトを返すと参照の同一性が壊れ、React のメモ化や === 比較に
 * 悪影響が出る。Discord がメンバーを実際に更新すると元のオブジェクトの参照ごと
 * 変わるため、WeakMap のキーとして自然にキャッシュミスし、古いコピーを握り続ける
 * こともない
 */
const memberNickCache = new WeakMap<object, { nickname: string; copy: any; }>();

function getMemberWithNick(member: any, nickname: string): any {
    const cached = memberNickCache.get(member);
    if (cached && cached.nickname === nickname) return cached.copy;

    const copy = withMemberNick(member, nickname);
    memberNickCache.set(member, { nickname, copy });
    return copy;
}

interface Wrap {
    target: any;
    method: string;
    original: AnyFn;
    /**
     * ラップ前に取得したプロパティ記述子。復元時にこれがあれば defineProperty で
     * 戻す。取得できなかった場合（記述子が存在しない等）は null で、代入で戻す
     */
    descriptor: PropertyDescriptor | null;
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

        const descriptor = Object.getOwnPropertyDescriptor(target, method) ?? null;
        const wrapper = make(original);

        try {
            // GuildMemberStore / RelationshipStore は Flux のクラスインスタンスなので、
            // ここへの代入は自身のプロパティとしてプロトタイプの上に生える形になり必ず成功する
            target[method] = wrapper;
        } catch {
            // UsernameUtils は findByPropsLazy が返す proxyLazy で、実体は webpack の
            // モジュール名前空間。ハーモニーエクスポートのプロパティは setter を持たない
            // アクセサのため、代入は strict モードで TypeError になる。Vencord 側の
            // patchWebpack は configurable: true を保証しているので、defineProperty
            // であれば proxyLazy の defineProperty トラップ経由で実モジュールへ届く
            Object.defineProperty(target, method, {
                value: wrapper,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }

        wraps.push({ target, method, original, descriptor });
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

    // ギルド内の表示（メンバーリスト、メッセージヘッダなど）は GuildMemberStore.getNick
    // ではなく getMember(guildId, userId).nick を直接読んでいる箇所があり、getNick だけ
    // ラップしても反映されないことが実機の突き合わせで確認できている。member が無い、
    // またはローカルニックネームが無い場合は元の値をそのまま返す（参照も含めて完全に
    // 不変）。それ以外は member の浅いコピーの nick だけを差し替えて返す
    //
    // getTrueMember は意図的にラップしない。あちらは「本物の、加工されていないメンバー」を
    // 返すためのアクセサで、Discord 純正の「ニックネームを変更」ダイアログの取得元になり
    // うる。ここまでラップしてしまうと、ローカルニックネームが Discord サーバーへ送信され
    // うるリスク（README/設計書に既知の制約として記載）を自ら広げることになるため、
    // 触らないでおく
    wrap(GuildMemberStore, "getMember", original => function (this: any, guildId: any, userId: any) {
        const member = original.call(this, guildId, userId);
        if (!member) return member;

        const nickname = getNickname(userId);
        if (nickname == null) return member;

        return getMemberWithNick(member, nickname);
    }, "GuildMemberStore.getMember");
}

export function removeNameOverrides(): void {
    // 復元に成功したものだけをリストから取り除く。失敗したものが混ざっていても
    // 次の start() は applyNameOverrides 内で target[method] を再度読み直して
    // wrap するため、いずれにせよ二重ラップにはなる（getNickname(id) ?? inner(...)
    // は冪等なので、これ自体は無害）。ここで記録を残す本当の理由は、復元に失敗した
    // ものの original を失わないこと。記録さえ残っていれば、後で逆順に defineProperty /
    // 代入をやり直すことで真の元関数へ戻す余地が残る。先に pop してしまうとその
    // original 自体を失い、二度と復元できない不可逆な状態になる。末尾から見て
    // splice するのは、走査中のインデックスを崩さないため
    for (let i = wraps.length - 1; i >= 0; i--) {
        const { target, method, original, descriptor } = wraps[i];
        try {
            if (descriptor) Object.defineProperty(target, method, descriptor);
            else target[method] = original;
            wraps.splice(i, 1);
        } catch (e) {
            console.error(`[LocalNicknames] ${method} の復元に失敗しました`, e);
        }
    }

    // UsernameUtils.getName の復元が失敗して wraps に記録が残っている場合、
    // originalGetName をここで null にしてしまうと、次の start() はまだラップされた
    // ままの target[method] を「元の関数」として originalGetName に束ねてしまう。
    // すると getOriginalName() がローカルニックネームを「元の表示名」として返す
    // ようになり、それが setNickname に label として保存されかねない。復元に
    // 失敗した場合は originalGetName を保持したままにして、この穴を防ぐ
    const getNameRestoreFailed = wraps.some(w => w.method === "getName" && w.target === UsernameUtils);
    if (!getNameRestoreFailed) originalGetName = null;
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
