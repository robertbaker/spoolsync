import { beforeEach, expect, test } from "bun:test";

import {
  loadResolutions,
  readLoadResult,
  saveLoadResult,
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
