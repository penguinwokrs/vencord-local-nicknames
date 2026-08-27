/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { lookupNickname, normalizeNickname, sortedEntries, withMemberNick, withNickname, withoutNickname } from "../nickname.ts";

test("normalizeNickname: 前後の空白を落とす", () => {
    assert.equal(normalizeNickname("  ぺんぎん  "), "ぺんぎん");
});

test("normalizeNickname: 空文字列は null", () => {
    assert.equal(normalizeNickname(""), null);
});

test("normalizeNickname: 空白のみは null", () => {
    assert.equal(normalizeNickname("   \t "), null);
});

test("lookupNickname: 登録済みの userId を引ける", () => {
    const map = { "123": { nickname: "ぺんぎん", label: "penguin" } };
    assert.equal(lookupNickname(map, "123"), "ぺんぎん");
});

test("lookupNickname: 未登録は null", () => {
    assert.equal(lookupNickname({}, "123"), null);
});

test("lookupNickname: map や userId が無ければ null", () => {
    assert.equal(lookupNickname(undefined, "123"), null);
    assert.equal(lookupNickname({}, undefined), null);
});

test("lookupNickname: 壊れたエントリは無視する", () => {
    assert.equal(lookupNickname({ "1": null }, "1"), null);
    assert.equal(lookupNickname({ "2": { nickname: 42 } }, "2"), null);
    assert.equal(lookupNickname({ "3": { nickname: "  " } }, "3"), null);
});

test("sortedEntries: label の昇順で返す", () => {
    const map = {
        "2": { nickname: "い", label: "bravo" },
        "1": { nickname: "あ", label: "alpha" }
    };
    assert.deepEqual(sortedEntries(map), [
        { userId: "1", nickname: "あ", label: "alpha" },
        { userId: "2", nickname: "い", label: "bravo" }
    ]);
});

test("sortedEntries: 壊れたエントリを除外する", () => {
    const map = {
        "1": { nickname: "あ", label: "alpha" },
        "2": null,
        "3": { nickname: "   ", label: "charlie" }
    };
    assert.deepEqual(sortedEntries(map), [
        { userId: "1", nickname: "あ", label: "alpha" }
    ]);
});

test("sortedEntries: label が無ければ userId で代用する", () => {
    const map = { "999": { nickname: "あ" } };
    assert.deepEqual(sortedEntries(map), [
        { userId: "999", nickname: "あ", label: "999" }
    ]);
});

test("sortedEntries: map が無ければ空配列", () => {
    assert.deepEqual(sortedEntries(undefined), []);
});

test("lookupNickname: 前後に空白がある場合でも正規化して返す", () => {
    const map = { "1": { nickname: "  あ  ", label: "a" } };
    assert.equal(lookupNickname(map, "1"), "あ");
});

test("sortedEntries: 前後に空白がある場合でも正規化して返す", () => {
    const map = { "1": { nickname: "  あ  ", label: "a" } };
    assert.deepEqual(sortedEntries(map), [
        { userId: "1", nickname: "あ", label: "a" }
    ]);
});

test("sortedEntries: nickname キーが無いエントリを除外する", () => {
    const map = { "1": { label: "a" } };
    assert.deepEqual(sortedEntries(map), []);
});

test("withNickname: 空のマップに追加できる", () => {
    const result = withNickname(undefined, "1", "ぺんぎん", "penguin");
    assert.deepEqual(result, { "1": { nickname: "ぺんぎん", label: "penguin" } });
});

test("withNickname: 既存のエントリがあるマップに追加できる", () => {
    const map = { "1": { nickname: "あ", label: "alpha" } };
    const result = withNickname(map, "2", "い", "bravo");
    assert.deepEqual(result, {
        "1": { nickname: "あ", label: "alpha" },
        "2": { nickname: "い", label: "bravo" }
    });
});

test("withNickname: 同じ userId のエントリを上書きする", () => {
    const map = { "1": { nickname: "あ", label: "alpha" } };
    const result = withNickname(map, "1", "い", "bravo");
    assert.deepEqual(result, { "1": { nickname: "い", label: "bravo" } });
});

test("withNickname: 前後の空白を正規化して保存する", () => {
    const result = withNickname(undefined, "1", "  あ  ", "alpha");
    assert.deepEqual(result, { "1": { nickname: "あ", label: "alpha" } });
});

test("withNickname: nickname が空欄・空白のみのエントリは含めない", () => {
    const result = withNickname(undefined, "1", "   ", "alpha");
    assert.deepEqual(result, {});
});

test("withNickname: 入力の map を変更しない", () => {
    const map = { "1": { nickname: "あ", label: "alpha" } };
    const snapshot = { ...map };
    withNickname(map, "2", "い", "bravo");
    assert.deepEqual(map, snapshot);
});

test("withNickname: プロキシ化されたエントリ値を含む source からでも、結果はプレーンオブジェクトになる (回帰テスト)", () => {
    const originalEntry = { nickname: "あ", label: "alpha" };
    const proxiedEntry = new Proxy(originalEntry, {});
    const map = { "1": proxiedEntry };

    const result = withNickname(map, "2", "い", "bravo");

    // 元のエントリがそのまま（Proxy のまま）持ち越されていないこと
    assert.notEqual(result["1"], proxiedEntry);
    assert.deepEqual(result["1"], { nickname: "あ", label: "alpha" });
    // structuredClone は Proxy を渡すと失敗するので、通ること自体が
    // 「プレーンオブジェクトである」ことの検証になる
    assert.doesNotThrow(() => structuredClone(result));
    assert.deepEqual(structuredClone(result), {
        "1": { nickname: "あ", label: "alpha" },
        "2": { nickname: "い", label: "bravo" }
    });
});

test("withoutNickname: 存在するエントリを削除できる", () => {
    const map = {
        "1": { nickname: "あ", label: "alpha" },
        "2": { nickname: "い", label: "bravo" }
    };
    const result = withoutNickname(map, "1");
    assert.deepEqual(result, { "2": { nickname: "い", label: "bravo" } });
});

test("withoutNickname: 存在しない userId を指定しても何も起きない", () => {
    const map = { "1": { nickname: "あ", label: "alpha" } };
    const result = withoutNickname(map, "999");
    assert.deepEqual(result, { "1": { nickname: "あ", label: "alpha" } });
});

test("withoutNickname: map が undefined でも空マップを返す", () => {
    assert.deepEqual(withoutNickname(undefined, "1"), {});
});

test("withoutNickname: 入力の map を変更しない", () => {
    const map = { "1": { nickname: "あ", label: "alpha" } };
    const snapshot = { ...map };
    withoutNickname(map, "1");
    assert.deepEqual(map, snapshot);
});

test("withoutNickname: プロキシ化されたエントリ値を含む source からでも、残りのエントリはプレーンオブジェクトになる (回帰テスト)", () => {
    const keptEntry = { nickname: "い", label: "bravo" };
    const map = {
        "1": new Proxy({ nickname: "あ", label: "alpha" }, {}),
        "2": new Proxy(keptEntry, {})
    };

    const result = withoutNickname(map, "1");

    assert.notEqual(result["2"], keptEntry);
    assert.deepEqual(result, { "2": { nickname: "い", label: "bravo" } });
    assert.doesNotThrow(() => structuredClone(result));
});

test("withMemberNick: nick 以外のプロパティはそのまま引き継がれる", () => {
    const member = { userId: "1", guildId: "2", nick: "元のニックネーム", roles: ["a", "b"], premiumSince: null };
    const result = withMemberNick(member, "ぺんぎん");
    assert.equal(result.userId, "1");
    assert.equal(result.guildId, "2");
    assert.deepEqual(result.roles, ["a", "b"]);
    assert.equal(result.premiumSince, null);
});

test("withMemberNick: nick が文字列だった場合、指定したニックネームに置き換わる", () => {
    const member = { userId: "1", nick: "元のニックネーム" };
    const result = withMemberNick(member, "ぺんぎん");
    assert.equal(result.nick, "ぺんぎん");
});

test("withMemberNick: nick が null だった場合でも、指定したニックネームに置き換わる", () => {
    const member = { userId: "1", nick: null };
    const result = withMemberNick(member, "ぺんぎん");
    assert.equal(result.nick, "ぺんぎん");
});

test("withMemberNick: 返り値は入力とは別の参照になる", () => {
    const member = { userId: "1", nick: null };
    const result = withMemberNick(member, "ぺんぎん");
    assert.notEqual(result, member);
});

test("withMemberNick: 入力の member を変更しない", () => {
    const member = { userId: "1", nick: "元のニックネーム" };
    const snapshot = { ...member };
    withMemberNick(member, "ぺんぎん");
    assert.deepEqual(member, snapshot);
});
