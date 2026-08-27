/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 penguinwokrs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { lookupNickname, normalizeNickname, sortedEntries } from "../nickname.ts";

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
