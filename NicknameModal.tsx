/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, TextInput, useState } from "@webpack/common";

import { getNickname, setNickname } from "./store";

interface Props {
    user: User;
    /** 元の表示名。タイトル下の表示と、保存する label に使う */
    baseName: string;
    props: RenderModalProps;
}

const noteStyle = {
    marginTop: "8px",
    fontSize: "12px",
    color: "var(--text-muted)"
} as const;

function NicknameModalInner({ user, baseName, props }: Props) {
    const existing = getNickname(user.id) ?? "";
    const [value, setValue] = useState(existing);

    const save = () => {
        setNickname(user.id, value, baseName);
        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={existing ? "ニックネームを変更" : "ニックネームを付ける"}
            subtitle={baseName}
            actions={[
                { text: "OK", variant: "primary", onClick: save },
                { text: "キャンセル", variant: "secondary", onClick: () => props.onClose() }
            ]}
        >
            {/* TextInput 側の onKeyDown の型が不安定なので、外側の div で拾う */}
            <div onKeyDown={e => { if (e.key === "Enter") save(); }}>
                <TextInput
                    value={value}
                    onChange={setValue}
                    placeholder="ニックネーム"
                    autoFocus
                />
            </div>
            <div style={noteStyle}>空欄のまま OK を押すとニックネームを解除します。</div>
            <div style={noteStyle}>反映されない箇所があれば Ctrl+R で再読み込みしてください。</div>
        </Modal>
    );
}

export const NicknameModal = ErrorBoundary.wrap(NicknameModalInner, { noop: true });
