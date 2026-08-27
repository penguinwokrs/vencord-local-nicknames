/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { Menu, openModal, UserStore } from "@webpack/common";

import { applyNameOverrides, getOriginalName, removeNameOverrides } from "./nameOverride";
import { NicknameModal } from "./NicknameModal";
import { clearNickname, getNickname, settings } from "./store";

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    // 自分自身にはニックネームを付けさせない
    if (user.id === UserStore.getCurrentUser()?.id) return;

    const current = getNickname(user.id);
    const baseName = getOriginalName(user);

    const open = () => openModal(props => (
        <NicknameModal user={user} baseName={baseName} props={props} />
    ));

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-local-nickname-set"
                label={current ? "ニックネームを変更" : "ニックネームを付ける"}
                action={open}
            />
            {current && (
                <Menu.MenuItem
                    id="vc-local-nickname-clear"
                    label="ニックネームを解除"
                    action={() => clearNickname(user.id)}
                />
            )}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "LocalNicknames",
    description: "他のユーザーに、自分のクライアント内でのみ有効なニックネームを付けます。サーバーをまたいでも同じ表示になります。",
    authors: [{ name: "penguinwokrs", id: 0n }],
    tags: ["Appearance", "Customisation"],
    settings,
    contextMenus: {
        "user-context": UserContext
    },

    start() {
        applyNameOverrides();
    },

    stop() {
        removeNameOverrides();
    }
});
