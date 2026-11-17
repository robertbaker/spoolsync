import { beforeEach, expect, test } from "bun:test";

import { pairKey } from "@spoolsync/core/core/match";
import { makeSpool } from "@spoolsync/core/core/testing";

import {
  clearTigertagSession,
  hasLoadResult,
  loadResolutions,
  loadTigertagSession,
  readLoadResult,
  saveLoadResult,
  saveRefreshedTigertagSession,
  saveResolutions,
  saveSpoolmanConnection,
  saveTigertagSession,
  saveBambuddyConnection,
  saveFilamentDbConnection,
  saveMatchDecisions,
  loadMatchDecisions,
} from "./storage";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("a failed replacement save clears the stale inventory without unloading other sources", () => {
  const previous = {
    source: "spoolman" as const,
    origin: "file" as const,
    spools: [],
    warnings: [],
    loadedAt: "old",
  };
  saveLoadResult(previous);
  saveLoadResult({ ...previous, source: "spoolio" });
  const storage = sessionStorage;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")!;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      setItem() {
        throw new DOMException("Storage is full", "QuotaExceededError");
      },
    },
  });
  try {
    expect(saveLoadResult({ ...previous, loadedAt: "new" })).toBe(false);
    expect(readLoadResult("spoolman")).toBeNull();
    expect(readLoadResult("spoolio")?.loadedAt).toBe("old");
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", descriptor);
  }
});

test("damaged stored inventories are ignored and cleared", () => {
  for (const value of [
    { source: "spoolio", spools: [null], warnings: [], loadedAt: "now" },
    { source: "spoolman", spools: [{ source: "spoolio" }], warnings: [], loadedAt: "now" },
    { source: "spoolman", spools: [], warnings: [1], loadedAt: "now" },
  ]) {
    sessionStorage.setItem("spoolsync:load:spoolman", JSON.stringify(value));
    expect(hasLoadResult("spoolman")).toBe(false);
    expect(readLoadResult("spoolman")).toBeNull();
    expect(sessionStorage.getItem("spoolsync:load:spoolman")).toBeNull();
  }
});

test("stored inventories retain valid spool records", () => {
  saveLoadResult({
    source: "spoolio",
    spools: [makeSpool("spoolio", "A1")],
    warnings: [],
    loadedAt: "now",
  });
  expect(readLoadResult("spoolio")?.spools[0]?.sourceId).toBe("A1");
});

test("stored inventories from before finish and TD were added stay available", () => {
  const legacySpool = { ...makeSpool("spoolio", "A1") } as Record<string, unknown>;
  delete legacySpool.finish;
  delete legacySpool.td;
  sessionStorage.setItem(
    "spoolsync:load:spoolio",
    JSON.stringify({
      source: "spoolio",
      spools: [legacySpool],
      warnings: [],
      loadedAt: "old",
    }),
  );

  expect(readLoadResult("spoolio")?.spools[0]).toMatchObject({
    sourceId: "A1",
    finish: null,
    td: null,
  });
});

test("switching servers clears API data and pending choices, but retains file data", () => {
  saveSpoolmanConnection({ baseUrl: "https://one.test", rememberToken: false });
  saveLoadResult({
    source: "spoolman",
    origin: "api",
    connectionId: "https://one.test",
    spools: [],
    warnings: [],
    loadedAt: "",
  });
  saveResolutions(new Map([["group", { values: {}, createIn: ["tigertag"] }]]));
  saveSpoolmanConnection({ baseUrl: "https://two.test", rememberToken: false });
  expect(readLoadResult("spoolman")).toBeNull();
  expect(loadResolutions().size).toBe(0);
  saveLoadResult({ source: "spoolman", origin: "file", spools: [], warnings: [], loadedAt: "" });
  saveSpoolmanConnection({ baseUrl: "https://three.test", rememberToken: false });
  expect(readLoadResult("spoolman")?.origin).toBe("file");
});

test("damaged sync choices are filtered before they reach the planner", () => {
  sessionStorage.setItem(
    "spoolsync:resolutions",
    JSON.stringify([
      ["invalid-create-target", { values: {}, createIn: "tigertag" }],
      ["invalid-values", { values: null, createIn: [] }],
      ["invalid-field-value", { values: { remainingWeight: "heavy" }, createIn: [] }],
      ["valid", { values: { material: "PLA" }, createIn: ["tigertag", "spoolstock", "tigertag"] }],
    ]),
  );

  expect([...loadResolutions()]).toEqual([
    ["invalid-field-value", { values: {}, createIn: [] }],
    ["valid", { values: { material: "PLA" }, createIn: ["tigertag"] }],
  ]);
});

test("token refresh keeps a snapshot while changing TigerTag accounts clears it", () => {
  const session = {
    uid: "one",
    email: "test@example.com",
    idToken: "test",
    refreshToken: "test",
    expiresAt: 1,
  };
  saveTigertagSession(session, false);
  saveLoadResult({
    source: "tigertag",
    origin: "api",
    connectionId: "one",
    spools: [],
    warnings: [],
    loadedAt: "",
  });
  saveTigertagSession({ ...session, idToken: "refreshed" }, false);
  expect(readLoadResult("tigertag")?.connectionId).toBe("one");
  saveTigertagSession({ ...session, uid: "two" }, false);
  expect(readLoadResult("tigertag")).toBeNull();
});

test("a late token refresh cannot undo a sign-out or replace another account", () => {
  const session = {
    uid: "one",
    email: "test@example.com",
    idToken: "first",
    refreshToken: "first",
    expiresAt: 1,
  };
  saveTigertagSession(session, false);
  saveRefreshedTigertagSession({ ...session, idToken: "refreshed" }, false);
  expect(loadTigertagSession()?.idToken).toBe("refreshed");

  saveTigertagSession({ ...session, uid: "two", idToken: "other" }, false);
  saveRefreshedTigertagSession({ ...session, idToken: "late" }, false);
  expect(loadTigertagSession()).toMatchObject({ uid: "two", idToken: "other" });

  clearTigertagSession();
  saveRefreshedTigertagSession({ ...session, idToken: "late" }, false);
  expect(loadTigertagSession()).toBeNull();
});

test("changing API credentials invalidates matching state and API snapshots but retains file data", () => {
  for (const source of ["bambuddy", "filamentdb"] as const) {
    const save = (credential: string) =>
      source === "bambuddy"
        ? saveBambuddyConnection({ baseUrl: "https://inventory.test", apiKey: credential })
        : saveFilamentDbConnection({ baseUrl: "https://inventory.test", token: credential });
    save("first");
    saveLoadResult({ source, origin: "api", spools: [], warnings: [], loadedAt: "before" });
    saveMatchDecisions({ confirmed: ["first|second"], rejected: [] });
    saveResolutions(new Map([["group", { values: {}, createIn: [] }]]));
    save("first");
    expect(readLoadResult(source)?.loadedAt).toBe("before");
    expect(loadResolutions().size).toBe(1);
    save("second");
    expect(readLoadResult(source)).toBeNull();
    expect(loadResolutions().size).toBe(0);
    expect(loadMatchDecisions()).toEqual({ confirmed: [], rejected: [] });
    saveLoadResult({ source, origin: "file", spools: [], warnings: [], loadedAt: "file" });
    save("third");
    expect(readLoadResult(source)?.loadedAt).toBe("file");
  }
});

test("match decisions saved before % and | were escaped in pair keys are read in the current form", () => {
  localStorage.setItem(
    "spoolsync:match-decisions",
    JSON.stringify({ confirmed: ["spoolman:50%|spoolio:a"], rejected: ["spoolio:b|spoolman:50%"] }),
  );
  const key = pairKey("spoolman:50%", "spoolio:a");
  expect(loadMatchDecisions().confirmed).toEqual([key]);
  expect(loadMatchDecisions().rejected).toEqual([pairKey("spoolio:b", "spoolman:50%")]);
  localStorage.clear();
});
