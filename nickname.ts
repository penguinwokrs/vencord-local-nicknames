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
 * 保存データから userId の label（保存した時点で見えていた元の表示名）を引く。
 * 未登録・label 無し・空文字列・壊れた形はいずれも null を返す。
 */
export function lookupLabel(map: NicknameMap | undefined, userId: string | undefined): string | null {
    if (!map || !userId) return null;

    const entry = map[userId];
    if (!entry || typeof entry.label !== "string" || entry.label.length === 0) return null;

    return entry.label;
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
            nickname: entry.nickname.trim(),
            label: typeof entry.label === "string" && entry.label.length > 0 ? entry.label : userId
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * source の全エントリを新しいプレーンオブジェクトとして組み直す。
 * SettingsStore の Proxy を経由した値がそのまま持ち越されないよう、
 * 各エントリを { nickname, label } のオブジェクトリテラルとして再構築する。
 * 壊れた形のエントリ（nickname が非空白の文字列でない）は除外する。
 */
function rebuildAsPlainMap(source: NicknameMap | undefined): NicknameMap {
    const next: NicknameMap = {};
    if (!source) return next;

    for (const [userId, entry] of Object.entries(source)) {
        if (!entry || typeof entry.nickname !== "string") continue;

        const trimmed = entry.nickname.trim();
        if (trimmed.length === 0) continue;

        next[userId] = {
            nickname: trimmed,
            label: typeof entry.label === "string" && entry.label.length > 0 ? entry.label : userId
        };
    }

    return next;
}

/**
 * userId のニックネームを追加・上書きした新しいマップを返す。
 * 元の map は変更しない。全エントリをプレーンオブジェクトとして再構築するため、
 * 元の値が（SettingsStore の Proxy のような）非プレーンなオブジェクトでも、
 * 返り値は structured clone 可能なプレーンデータのみになる。
 * nickname が空欄・空白のみの場合はそのエントリを含めない。
 */
export function withNickname(map: NicknameMap | undefined, userId: string, nickname: string, label: string): NicknameMap {
    const next = rebuildAsPlainMap(map);

    const trimmed = nickname.trim();
    if (trimmed.length === 0) delete next[userId];
    else next[userId] = { nickname: trimmed, label };

    return next;
}

/**
 * userId のニックネームを削除した新しいマップを返す。元の map は変更しない。
 * withNickname と同様、全エントリをプレーンオブジェクトとして再構築する。
 */
export function withoutNickname(map: NicknameMap | undefined, userId: string): NicknameMap {
    const next = rebuildAsPlainMap(map);
    delete next[userId];
    return next;
}

/**
 * GuildMemberStore.getMember が返すメンバーオブジェクトの nick を、指定した
 * ニックネームに置き換えた新しいオブジェクトを返す。元の member は変更しない。
 * nick 以外のプロパティはすべてそのまま引き継ぐ（浅いコピー）。
 */
export function withMemberNick(member: Record<string, any>, nickname: string): Record<string, any> {
    return { ...member, nick: nickname };
}

/**
 * ニックネーム入力欄の初期値を返す。
 * 既にニックネームが付いていればそれを、まだ付いていなければ元の表示名を初期値にする。
 * 未設定の相手に付けるとき、元の名前を消して打ち直すのではなく、そこから編集できるようにするため。
 *
 * 元の表示名が空・空白のみの場合は空欄のままにする。空欄で OK を押すと解除になる
 * （store.ts / withNickname 参照）ので、実質「何もしない」に落ちる。
 */
export function initialNicknameInput(existing: string | null | undefined, baseName: string | undefined): string {
    if (typeof existing === "string" && existing.trim().length > 0) return existing;
    return typeof baseName === "string" ? baseName.trim() : "";
}
