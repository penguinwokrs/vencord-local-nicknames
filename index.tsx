/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { GuildMemberStore, LocaleStore, Menu, openModal, RelationshipStore, UsernameUtils, UserStore } from "@webpack/common";

import { NicknameList, NicknameModal, NicknameProfileSection } from "./components";
import { clearNickname, getNickname, getNicknameMapRef, invalidateNicknameCache, settings } from "./settings";
import { NicknameMap, pickStrings, withMemberNick } from "./utils";

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

/**
 * GuildMemberStore.getMembers が返す配列全体の、nick 差し替え済みコピーの
 * キャッシュ。元の配列オブジェクトをキーにし、その配列が「どの nicknames マップの
 * 参照を元に作られたか」（settings.ts の getNicknameMapRef）を一緒に持つ。getMembers は
 * ギルドの全メンバーを返し、@ メンションのオートコンプリートが入力のたびに呼ぶため、
 * 一致しない限り毎回新しい配列を作るのは避けたい。nicknames マップは
 * setNickname/clearNickname のときだけ新しい参照に置き換わる（settings.ts 参照）ので、
 * 参照が前回と同じなら中身も変わっていないと判定できる。GuildMemberStore が実際に
 * メンバーを更新すると元の配列の参照ごと変わるため、WeakMap のキーとして自然に
 * キャッシュミスし、古い配列を握り続けることもない
 */
const membersArrayCache = new WeakMap<any[], { nicknameMapRef: NicknameMap; result: any[]; }>();

function getMembersWithNicks(members: any[]): any[] {
    const nicknameMapRef = getNicknameMapRef();

    const cached = membersArrayCache.get(members);
    if (cached && cached.nicknameMapRef === nicknameMapRef) return cached.result;

    // 差し替えが1件もなければ、割り当てを増やさないよう元の配列をそのまま返す
    // （参照も含めて完全に不変）。差し替えがある要素だけ getMemberWithNick で
    // 置き換え、それ以外の要素は参照をそのまま引き継ぐ
    let result = members;
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const nickname = getNickname(member?.userId);
        if (nickname == null) continue;

        if (result === members) result = members.slice();
        result[i] = getMemberWithNick(member, nickname);
    }

    membersArrayCache.set(members, { nicknameMapRef, result });
    return result;
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

function applyNameOverrides(): void {
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
    wrap(GuildMemberStore, "getMember", original => function (this: any, guildId: any, userId: any) {
        const member = original.call(this, guildId, userId);
        if (!member) return member;

        const nickname = getNickname(userId);
        if (nickname == null) return member;

        return getMemberWithNick(member, nickname);
    }, "GuildMemberStore.getMember");

    // @ メンションのオートコンプリートは GuildMemberStore.getNick でも getMember
    // （単数）でもなく、queryGuildUsers が GuildMemberStore.getMembers(guildId) で
    // 取得したギルドの全メンバー配列をそのまま候補元にしてマッチングしている
    // （Discord の実モジュールソースで確認済み）。getMember 側の置き換えだけでは
    // この配列に反映されないため、getMembers 自体もラップする。差し替えは
    // getMember と同じ getMemberWithNick（WeakMap キャッシュ）を再利用するので、
    // 同じメンバーであれば getMember 経由でも getMembers 経由でも同一の参照を返す。
    // 配列自体のキャッシュは membersArrayCache を参照
    wrap(GuildMemberStore, "getMembers", original => function (this: any, guildId: any) {
        const members = original.call(this, guildId);
        if (!Array.isArray(members)) return members;

        return getMembersWithNicks(members);
    }, "GuildMemberStore.getMembers");

    // getTrueMember は意図的にラップしない。あちらは「本物の、加工されていないメンバー」を
    // 返すためのアクセサで、Discord 純正の「ニックネームを変更」ダイアログの取得元になり
    // うる。getMember / getMembers をここまでラップしてもなお、ローカルニックネームが
    // Discord サーバーへ送信されうるリスク（README/設計書に既知の制約として記載）を
    // これ以上自ら広げないため、getTrueMember にだけは触れないでおく
}

function removeNameOverrides(): void {
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
function getOriginalName(user: { globalName?: string | null; username: string; }): string {
    try {
        if (originalGetName) return originalGetName.call(UsernameUtils, user);
    } catch {
        // 下のフォールバックに落とす
    }
    return user.globalName || user.username;
}

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    // 自分自身にはニックネームを付けさせない
    if (user.id === UserStore.getCurrentUser()?.id) return;

    const s = pickStrings(LocaleStore.locale);
    const current = getNickname(user.id);
    const baseName = getOriginalName(user);

    const open = () => openModal(props => (
        <NicknameModal user={user} baseName={baseName} props={props} />
    ));

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-local-nickname-set"
                label={current ? s.menuChange : s.menuSet}
                action={open}
            />
            {current && (
                <Menu.MenuItem
                    id="vc-local-nickname-clear"
                    label={s.menuClear}
                    action={() => clearNickname(user.id)}
                />
            )}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "LocalNicknames",
    description: "Give other users a nickname that only exists in your own client. It stays the same across every server.",
    // 上流へ出す際は EquicordDevs.penguinwokrs へ差し替える。あちらは Equicord 側の
    // src/utils/constants.ts に定義を追加して初めて存在するため、単体で成立させる
    // 必要があるこのリポジトリではインラインのまま持つ（設計書 4.1.1 に差分を記載）
    authors: [{ name: "penguinwokrs", id: 385266832136863746n }],
    tags: ["Appearance", "Customisation"],
    settings,
    settingsAboutComponent: NicknameList,
    contextMenus: {
        "user-context": UserContext
    },

    // ニックネームを付けると元の名前を確認する手段が無くなるため、プロフィールに
    // 両方を並べて出す。webpack パッチは Equicord 側の ProfileSectionsAPI が持ち、
    // 本プラグイン自体はパッチを持たない（登録と解除は PluginManager が行う）
    dependencies: ["ProfileSectionsAPI"],
    renderProfileSection: {
        render: NicknameProfileSection,
        priority: 0
    },

    start() {
        // 無効化されていた間に設定インポートやクラウド同期のダウンロードが
        // 起きていた場合に備え、nicknames マップのキャッシュを読み直させる
        invalidateNicknameCache();
        applyNameOverrides();
    },

    stop() {
        removeNameOverrides();
    }
});
