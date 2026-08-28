/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps, User } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { Button, LocaleStore, Modal, TextInput, useState, UserStore } from "@webpack/common";

import { clearNickname, getNickname, setNickname, settings } from "./settings";
import { initialNicknameInput, lookupLabel, pickStrings, sortedEntries } from "./utils";

/**
 * プロフィールの「Discord 参加日」あたりに並ぶ、見出し付きセクションのコンポーネント。
 * voiceStats（Equicord 同梱）が同じ検索条件で引いているものと同一
 */
const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");

const noteStyle = {
    marginTop: "8px",
    fontSize: "12px",
    color: "var(--text-muted)"
} as const;

const listRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px"
} as const;

const profileRowStyle = {
    display: "flex",
    gap: "6px"
} as const;

const profileLabelStyle = {
    color: "var(--text-muted)"
} as const;

interface ModalProps {
    user: User;
    /** 元の表示名。タイトル下の表示と、保存する label に使う */
    baseName: string;
    props: RenderModalProps;
}

function NicknameModalInner({ user, baseName, props }: ModalProps) {
    const s = pickStrings(LocaleStore.locale);
    const existing = getNickname(user.id);
    // まだニックネームが無い相手には元の表示名を初期値として入れ、そこから編集できるようにする
    const [value, setValue] = useState(() => initialNicknameInput(existing, baseName));

    const save = () => {
        setNickname(user.id, value, baseName);
        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={existing ? s.modalTitleChange : s.modalTitleSet}
            subtitle={baseName}
            actions={[
                { text: s.ok, variant: "primary", onClick: save },
                { text: s.cancel, variant: "secondary", onClick: () => props.onClose() }
            ]}
        >
            {/* TextInput 側の onKeyDown の型が不安定なので、外側の div で拾う */}
            <div onKeyDown={e => {
                // IME composition中の Enter は Submit と見なさない
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                    // ここで止めないと、この Enter が背後の Discord メッセージ入力欄まで
                    // 届いてしまい、改行が挿入されてしまう
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation?.();
                    save();
                }
            }}>
                <TextInput
                    value={value}
                    onChange={setValue}
                    placeholder={s.inputPlaceholder}
                    autoFocus
                />
            </div>
            <div style={noteStyle}>{s.emptyToClear}</div>
            <div style={noteStyle}>{s.reloadHint}</div>
        </Modal>
    );
}

function NicknameListInner() {
    const s = pickStrings(LocaleStore.locale);
    const { nicknames } = settings.use(["nicknames"]);
    const entries = sortedEntries(nicknames);

    if (entries.length === 0) {
        return <div style={{ color: "var(--text-muted)" }}>{s.listEmpty}</div>;
    }

    return (
        <>
            <div style={{ marginBottom: "8px", fontWeight: 600 }}>{s.listTitle}</div>
            {entries.map(entry => {
                // 現在キャッシュに載っていればそちらを優先し、無ければ保存時の名前を使う
                const user = UserStore.getUser(entry.userId);
                const original = user ? (user.globalName || user.username) : entry.label;

                return (
                    <div key={entry.userId} style={listRowStyle}>
                        <span style={{ flex: 1 }}>{original} → {entry.nickname}</span>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            onClick={() => clearNickname(entry.userId)}
                        >
                            {s.delete}
                        </Button>
                    </div>
                );
            })}
        </>
    );
}

function ProfileRow({ label, value }: { label: string; value: string; }) {
    return (
        <div style={profileRowStyle}>
            <BaseText size="sm" style={profileLabelStyle}>{label}</BaseText>
            <BaseText size="sm">{value}</BaseText>
        </div>
    );
}

function NicknameProfileSectionInner({ userId, isSideBar }: { userId: string; isSideBar: boolean; }) {
    const s = pickStrings(LocaleStore.locale);
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
            heading={s.profileSection}
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <ProfileRow label={s.originalName} value={original} />
            <ProfileRow label={s.nickname} value={nickname} />
        </Section>
    );
}

export const NicknameModal = ErrorBoundary.wrap(NicknameModalInner, { noop: true });
export const NicknameList = ErrorBoundary.wrap(NicknameListInner, { noop: true });
export const NicknameProfileSection = ErrorBoundary.wrap(NicknameProfileSectionInner, { noop: true });
