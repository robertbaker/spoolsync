import { beforeEach, expect, test } from "bun:test";

import { forgetEverything, forgetGroup, formatBytes, listSavedData } from "./saved-data";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("lists only groups that hold something, with sizes", () => {
  expect(listSavedData()).toEqual([]);
  localStorage.setItem("spoolsync:prefs", '{"lowOnly":true}');
  localStorage.setItem("spoolsync:chart-view", "brand");
  localStorage.setItem("unrelated", "keep me");
  sessionStorage.setItem("spoolsync:load:spoolio", "{}");
  const items = listSavedData();
  expect(items.map((item) => item.group.id)).toEqual(["preferences", "inventories"]);
  expect(items[0]!.keys.sort()).toEqual(["spoolsync:chart-view", "spoolsync:prefs"]);
  expect(items[0]!.bytes).toBeGreaterThan(20);
});

test("forgetting a group leaves the rest, and never touches other sites' keys", () => {
  localStorage.setItem("spoolsync:file-history", "{}");
  localStorage.setItem("spoolsync:match-decisions", "{}");
  localStorage.setItem("other-app", "x");
  expect(forgetGroup("files")).toBe(1);
  expect(localStorage.getItem("spoolsync:file-history")).toBeNull();
  expect(localStorage.getItem("spoolsync:match-decisions")).toBe("{}");
  expect(forgetGroup("files")).toBe(0);
  expect(forgetGroup("no-such-group")).toBe(0);
});

test("a session prefix group matches every loaded inventory", () => {
  sessionStorage.setItem("spoolsync:load:spoolio", "1");
  sessionStorage.setItem("spoolsync:load:spoolkeep", "2");
  sessionStorage.setItem("spoolsync:resolutions", "[]");
  expect(forgetGroup("inventories")).toBe(3);
});

test("forgetting everything clears all spoolsync keys, including ones no group names", () => {
  localStorage.setItem("spoolsync:prefs", "{}");
  localStorage.setItem("spoolsync:future-setting", "1");
  sessionStorage.setItem("spoolsync:load:spoolio", "{}");
  localStorage.setItem("other-app", "x");
  expect(forgetEverything()).toBe(3);
  expect(localStorage.getItem("other-app")).toBe("x");
  expect(listSavedData()).toEqual([]);
});

test("sizes are shown in plain units", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2.0 KB");
});
