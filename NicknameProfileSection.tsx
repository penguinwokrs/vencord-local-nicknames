/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { findComponentByCodeLazy } from "@webpack";
import { UserStore } from "@webpack/common";

import { lookupLabel } from "./nickname";
import { getNickname, settings } from "./store";

/**
 * プロフィールの「Discord 参加日」あたりに並ぶ、見出し付きセクションのコンポーネント。
 * voiceStats（Equicord 同梱）が同じ検索条件で引いているものと同一
 */
const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");

const rowStyle = {
    display: "flex",
    gap: "6px"
} as const;

const labelStyle = {
    color: "var(--text-muted)"
} as const;

function Row({ label, value }: { label: string; value: string; }) {
    return (
        <div style={rowStyle}>
            <BaseText size="sm" style={labelStyle}>{label}</BaseText>
            <BaseText size="sm">{value}</BaseText>
        </div>
    );
}

function NicknameProfileSectionInner({ userId, isSideBar }: { userId: string; isSideBar: boolean; }) {
    // ニックネームの追加・変更・削除で再描画されるよう、設定を購読しておく
    const { nicknames } = settings.use(["nicknames"]);

    const nickname = getNickname(userId);
    // ニックネームを付けていない相手にはセクションごと出さない
    if (!nickname) return null;

    // 元の表示名は user オブジェクトの生データから取る。ここは getName 系の
    // ラップを通らないため、ニックネームではなく本来の名前が得られる。
    // ユーザーがキャッシュに載っていない場合は保存時の名前へ、それも無ければ ID へ落とす
    const user = UserStore.getUser(userId);
    const original = (user && (user.globalName || user.username)) || lookupLabel(nicknames, userId) || userId;

    return (
        <Section
            heading="ローカルニックネーム"
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <Row label="元の名前" value={original} />
            <Row label="ニックネーム" value={nickname} />
        </Section>
    );
}

export const NicknameProfileSection = ErrorBoundary.wrap(NicknameProfileSectionInner, { noop: true });
