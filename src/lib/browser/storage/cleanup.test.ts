import { afterEach, describe, expect, test } from "bun:test";

import { CLEANUP_RULE_IDS } from "@spoolsync/core/core/cleanup";

import {
  clearAcceptedCleanups,
  loadAcceptedCleanups,
  loadCleanupSettings,
  saveAcceptedCleanups,
  saveCleanupSettings,
} from "./cleanup";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("cleanup settings", () => {
  test("default to every rule and store nothing for the default", () => {
    expect(loadCleanupSettings().enabled).toEqual([...CLEANUP_RULE_IDS]);
    saveCleanupSettings({ enabled: [...CLEANUP_RULE_IDS] });
    expect(localStorage.getItem("spoolsync:cleanup-settings")).toBeNull();
  });

  test("remember a changed selection, including all rules off", () => {
    saveCleanupSettings({ enabled: ["casing", "whitespace"] });
    expect(loadCleanupSettings().enabled).toEqual(["whitespace", "casing"]);
    saveCleanupSettings({ enabled: [] });
    expect(loadCleanupSettings().enabled).toEqual([]);
  });

  test("damaged storage falls back to every rule", () => {
    localStorage.setItem("spoolsync:cleanup-settings", "{not json");
    expect(loadCleanupSettings().enabled).toEqual([...CLEANUP_RULE_IDS]);
    localStorage.setItem("spoolsync:cleanup-settings", JSON.stringify({ enabled: "casing" }));
    expect(loadCleanupSettings().enabled).toEqual([...CLEANUP_RULE_IDS]);
  });
});

describe("accepted cleanups", () => {
  const entry = { spoolKey: "spoolman:1", field: "vendor", before: "esun", after: "eSUN" } as const;

  test("are kept for this tab only and can be cleared", () => {
    saveAcceptedCleanups([entry]);
    expect(sessionStorage.getItem("spoolsync:cleanup-accepted")).not.toBeNull();
    expect(localStorage.getItem("spoolsync:cleanup-accepted")).toBeNull();
    expect(loadAcceptedCleanups()).toEqual([entry]);
    clearAcceptedCleanups();
    expect(loadAcceptedCleanups()).toEqual([]);
  });

  test("an empty list removes the key and junk is ignored", () => {
    saveAcceptedCleanups([entry]);
    saveAcceptedCleanups([]);
    expect(sessionStorage.getItem("spoolsync:cleanup-accepted")).toBeNull();
    sessionStorage.setItem("spoolsync:cleanup-accepted", "[1,{\"spoolKey\":5}]");
    expect(loadAcceptedCleanups()).toEqual([]);
    sessionStorage.setItem("spoolsync:cleanup-accepted", "not json");
    expect(loadAcceptedCleanups()).toEqual([]);
  });
});
