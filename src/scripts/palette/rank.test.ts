import { expect, test } from "bun:test";

import { fuzzyScore, normalize, pushRecent, rankItems, resultsFor, withRecents } from "./rank";

const item = (id: string, title: string, subtitle?: string, keywords?: string) => ({
  id,
  title,
  subtitle,
  keywords,
});

test("normalizes case and accents", () => {
  expect(normalize("Prúsament PLA")).toBe("prusament pla");
});

test("every word must match, as a substring or as letters in order", () => {
  expect(fuzzyScore("sync", "Go to Sync")).not.toBeNull();
  expect(fuzzyScore("gts", "Go to Sync")).not.toBeNull();
  expect(fuzzyScore("sync zzz", "Go to Sync")).toBeNull();
  expect(fuzzyScore("xyz", "Go to Sync")).toBeNull();
  expect(fuzzyScore("", "anything")).toBe(0);
  expect(fuzzyScore("   ", "anything")).toBe(0);
});

test("prefix and word-start matches beat matches inside a word", () => {
  const prefix = fuzzyScore("load", "Load page")!;
  const wordStart = fuzzyScore("load", "Go to Load")!;
  const inside = fuzzyScore("load", "Unloaded")!;
  expect(prefix).toBeGreaterThan(wordStart);
  expect(wordStart).toBeGreaterThan(inside);
});

test("consecutive letters beat scattered ones", () => {
  expect(fuzzyScore("pla", "PLA basic")!).toBeGreaterThan(fuzzyScore("pla", "Polymaker Lite Aqua")!);
});

test("ranks title matches ahead of subtitle and keyword matches", () => {
  const items = [
    item("a", "Open shortcuts", "Lists keys such as sync"),
    item("b", "Go to Sync"),
    item("c", "Unrelated", undefined, "sync helper"),
  ];
  const ranked = rankItems(items, "sync").map((entry) => entry.id);
  expect(ranked[0]).toBe("b");
  expect([...ranked].sort()).toEqual(["a", "b", "c"]);
});

test("keeps the original order for equal scores and for an empty query", () => {
  const items = [item("1", "Alpha tool"), item("2", "Alpha tool"), item("3", "Alpha tool")];
  expect(rankItems(items, "alpha").map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  expect(rankItems(items, "").map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  expect(rankItems(items, "", 2)).toHaveLength(2);
  expect(rankItems(items, "alpha", 1)).toHaveLength(1);
});

test("matches words spread across the title, subtitle and keywords", () => {
  const items = [item("s", "Polymaker PLA Red", "Spoolio · 400 g left", "spool filament")];
  expect(rankItems(items, "pla spoolio")).toHaveLength(1);
  expect(rankItems(items, "pla bambuddy")).toHaveLength(0);
});

test("finds nothing for text that is not there", () => {
  expect(rankItems([item("a", "Go to Load")], "qqq")).toEqual([]);
  expect(rankItems([], "x")).toEqual([]);
});

test("recents come first and unknown ids are ignored", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(withRecents(items, ["c", "gone", "a"]).map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  expect(withRecents(items, []).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
});

test("recent list is deduplicated and capped", () => {
  expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
  expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
});

test("results list commands first, caps spools, and hides spools without a query", () => {
  const commands = [item("c1", "Go to Load"), item("c2", "Open Spoolio panel")];
  const spools = Array.from({ length: 12 }, (_, n) => item(`s${n}`, `PLA spool ${n}`));
  expect(resultsFor("", commands, spools, ["c2"]).map((entry) => entry.id)).toEqual(["c2", "c1"]);
  const found = resultsFor("pla", commands, spools, []);
  expect(found[0]!.id).toBe("c2");
  expect(found.filter((entry) => entry.id.startsWith("s"))).toHaveLength(8);
  const loadFirst = resultsFor("load", commands, spools, []);
  expect(loadFirst[0]!.id).toBe("c1");
});
