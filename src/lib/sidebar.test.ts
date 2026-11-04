import { expect, test } from "bun:test";

import {
  hasUnreadChangelog,
  isNavCurrent,
  loadedBadge,
  otherSidebarMode,
  parseSidebarMode,
  sidebarSteps,
  workflowStepForPath,
} from "./sidebar";

test("stored sidebar modes fall back to expanded and toggle", () => {
  expect(parseSidebarMode("collapsed")).toBe("collapsed");
  expect(parseSidebarMode("expanded")).toBe("expanded");
  expect(parseSidebarMode(null)).toBe("expanded");
  expect(parseSidebarMode("wide")).toBe("expanded");
  expect(otherSidebarMode("expanded")).toBe("collapsed");
  expect(otherSidebarMode("collapsed")).toBe("expanded");
});

test("navigation entries are current on their path, match paths and child pages", () => {
  const inventory = { href: "/load", matchPaths: ["/load", "/sync", "/inventory"] };
  expect(isNavCurrent(inventory, "/load")).toBe(true);
  expect(isNavCurrent(inventory, "/sync/")).toBe(true);
  expect(isNavCurrent(inventory, "/cli")).toBe(false);
  expect(isNavCurrent({ href: "/" }, "/")).toBe(true);
  expect(isNavCurrent({ href: "/" }, "/cli")).toBe(false);
  expect(isNavCurrent({ href: "/resources" }, "/resources/some-post")).toBe(true);
  expect(isNavCurrent({ href: "/resources" }, "/resourcesx")).toBe(false);
  // A file-format static build reports pages as /load.html.
  expect(isNavCurrent(inventory, "/sync.html")).toBe(true);
  expect(isNavCurrent({ href: "/" }, "/index.html")).toBe(true);
  expect(isNavCurrent({ href: "/cli" }, "/load.html")).toBe(false);
});

test("paths map to workflow steps only on the inventory pages", () => {
  expect(workflowStepForPath("/load", "")).toBe("load");
  expect(workflowStepForPath("/sync", "")).toBe("review");
  expect(workflowStepForPath("/sync", "#tour-apply")).toBe("apply");
  expect(workflowStepForPath("/", "")).toBeNull();
});

test("steps lose their current marker off the inventory pages", () => {
  const views = [
    { id: "load", state: "current", meta: "a" },
    { id: "review", state: "todo", meta: "b" },
    { id: "apply", state: "todo", meta: "c" },
  ] as const;
  expect(sidebarSteps(views, true, 0).map((view) => view.state)).toEqual([
    "current",
    "todo",
    "todo",
  ]);
  expect(sidebarSteps(views, false, 2).map((view) => view.state)).toEqual(["done", "todo", "todo"]);
  expect(sidebarSteps(views, false, 0).map((view) => view.state)).toEqual(["todo", "todo", "todo"]);
});

test("the changelog badge needs a prior read and a newer version", () => {
  expect(hasUnreadChangelog(null, "1.2.0")).toBe(false);
  expect(hasUnreadChangelog("1.2.0", "1.2.0")).toBe(false);
  expect(hasUnreadChangelog("1.1.0", "1.2.0")).toBe(true);
  expect(hasUnreadChangelog("1.1.0", "")).toBe(false);
});

test("the inventory badge shows a count only when something is loaded", () => {
  expect(loadedBadge(0)).toBe("");
  expect(loadedBadge(3)).toBe("3");
});
