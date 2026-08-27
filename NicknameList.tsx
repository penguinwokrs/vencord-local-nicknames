/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Button, UserStore } from "@webpack/common";

import { sortedEntries } from "./nickname";
import { clearNickname, settings } from "./store";

const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px"
} as const;

function NicknameListInner() {
    const { nicknames } = settings.use(["nicknames"]);
    const entries = sortedEntries(nicknames);

    if (entries.length === 0) {
        return (
            <div style={{ color: "var(--text-muted)" }}>
                まだニックネームは登録されていません。ユーザーを右クリックして「ニックネームを付ける」から登録できます。
            </div>
        );
    }

    return (
        <>
            <div style={{ marginBottom: "8px", fontWeight: 600 }}>保存済みのニックネーム</div>
            {entries.map(entry => {
                // 現在キャッシュに載っていればそちらを優先し、無ければ保存時の名前を使う
                const user = UserStore.getUser(entry.userId);
                const original = user ? (user.globalName || user.username) : entry.label;

                return (
                    <div key={entry.userId} style={rowStyle}>
                        <span style={{ flex: 1 }}>{original} → {entry.nickname}</span>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            onClick={() => clearNickname(entry.userId)}
                        >
                            削除
                        </Button>
                    </div>
                );
            })}
        </>
    );
}

export const NicknameList = ErrorBoundary.wrap(NicknameListInner, { noop: true });
