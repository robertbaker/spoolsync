import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_REFERENCE_SETTINGS,
  type ReferenceCacheEntry,
  type ReferenceFilament,
} from "@spoolsync/core/core/reference";

import { exportSettings, forgetGroup, importSettings, listSavedData } from "../../saved-data";
import { sleep } from "../reference-io";
import {
  clearReferenceCache,
  loadAcceptedReferences,
  loadReferenceCache,
  loadReferenceCatalog,
  loadReferenceChoices,
  loadReferenceRuledOut,
  loadReferenceSettings,
  saveAcceptedReferences,
  saveReferenceCacheEntry,
  saveReferenceChoices,
  saveReferenceRuledOut,
  saveReferenceSettings,
  setCatalogBodies,
  touchReferenceCache,
} from "./reference";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const filament = (id: string): ReferenceFilament => ({
  id,
  providerId: "filamentcolors",
  providerLabel: "FilamentColors",
  vendor: "Acme",
  name: null,
  material: "PLA",
  colorName: "Red",
  colorHex: "FF0000",
  colorHexes: ["FF0000"],
  diameter: 1.75,
  density: null,
  nozzleTempMin: null,
  nozzleTempMax: null,
  bedTempMin: null,
  bedTempMax: null,
  initialWeight: null,
  emptySpoolWeight: null,
  price: null,
  barcode: null,
  url: null,
  attribution: "Example",
  license: null,
});

const entry = (providerId: string, count = 2): ReferenceCacheEntry => ({
  providerId,
  key: "abc",
  fetchedAt: 1000,
  ttlMs: 5000,
  attribution: "Example",
  license: null,
  filaments: Array.from({ length: count }, (_, index) => ({
    ...filament(`f${index}`),
    providerId,
  })),
});

describe("reference settings", () => {
  test("default to the file provider and store nothing for the default", () => {
    expect(loadReferenceSettings()).toEqual(DEFAULT_REFERENCE_SETTINGS);
    saveReferenceSettings(DEFAULT_REFERENCE_SETTINGS);
    expect(localStorage.getItem("spoolsync:reference-settings")).toBeNull();
  });

  test("remember a changed selection and survive damaged storage", () => {
    saveReferenceSettings({
      providerId: "filamentcolors",
      policy: { fields: ["density"], overwrite: ["density"] },
      providers: {},
    });
    expect(loadReferenceSettings()).toMatchObject({
      providerId: "filamentcolors",
      policy: { fields: ["density"], overwrite: ["density"] },
    });
    localStorage.setItem("spoolsync:reference-settings", "{not json");
    expect(loadReferenceSettings()).toEqual(DEFAULT_REFERENCE_SETTINGS);
  });
});

/** An in-memory stand-in for IndexedDB, which the test runtime does not have. */
function memoryBodies(options: { failPut?: boolean } = {}) {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (id: string) => map.get(id) ?? null,
    put: async (id: string, value: unknown) => {
      if (options.failPut) return false;
      map.set(id, value);
      return true;
    },
    remove: async (id?: string) => {
      if (id) map.delete(id);
      else map.clear();
    },
  };
}

describe("reference cache", () => {
  let bodies = memoryBodies();
  beforeEach(() => {
    bodies = memoryBodies();
    setCatalogBodies(bodies);
  });
  afterEach(() => setCatalogBodies(null));

  test("keeps one entry per provider, the records apart from the description", async () => {
    expect(await saveReferenceCacheEntry(entry("filamentcolors"))).toBe(true);
    expect(
      await saveReferenceCacheEntry({
        ...entry("openfilamentdatabase"),
        sourceToken: "t1",
        via: "snapshot",
      }),
    ).toBe(true);
    const meta = loadReferenceCache();
    expect(Object.keys(meta).sort()).toEqual(["filamentcolors", "openfilamentdatabase"]);
    expect(meta["openfilamentdatabase"]).toMatchObject({
      sourceToken: "t1",
      via: "snapshot",
      count: 2,
    });
    expect(meta["filamentcolors"]).toMatchObject({ sourceToken: null, via: "fetch", count: 2 });
    expect(localStorage.getItem("spoolsync:reference-cache")).not.toContain("filaments");
    expect((await loadReferenceCatalog("filamentcolors"))!.map((f) => f.id)).toEqual(["f0", "f1"]);
    expect(await loadReferenceCatalog("never-stored")).toBeNull();
  });

  test("clears providers separately, and everything", async () => {
    await saveReferenceCacheEntry(entry("filamentcolors"));
    await saveReferenceCacheEntry(entry("openfilamentdatabase"));
    await clearReferenceCache("filamentcolors");
    expect(Object.keys(loadReferenceCache())).toEqual(["openfilamentdatabase"]);
    expect(bodies.map.has("filamentcolors")).toBe(false);
    await clearReferenceCache();
    expect(localStorage.getItem("spoolsync:reference-cache")).toBeNull();
    expect(bodies.map.size).toBe(0);
    await clearReferenceCache("never-stored");
  });

  test("touching marks the catalog current without rewriting its records", async () => {
    await saveReferenceCacheEntry(entry("filamentcolors"));
    bodies.map.clear();
    touchReferenceCache("filamentcolors", 9999);
    expect(loadReferenceCache()["filamentcolors"]!.fetchedAt).toBe(9999);
    touchReferenceCache("never-stored", 1);
    expect(Object.keys(loadReferenceCache())).toEqual(["filamentcolors"]);
  });

  test("a catalog the browser will not store, or too large, leaves no description behind", async () => {
    setCatalogBodies(memoryBodies({ failPut: true }));
    expect(await saveReferenceCacheEntry(entry("filamentcolors"))).toBe(false);
    expect(localStorage.getItem("spoolsync:reference-cache")).toBeNull();
    setCatalogBodies(bodies);
    expect(await saveReferenceCacheEntry(entry("filamentcolors", 60_001))).toBe(false);
    expect(loadReferenceCache()).toEqual({});
  });

  test("damaged storage reads as empty; records are re-validated", async () => {
    localStorage.setItem("spoolsync:reference-cache", "oops");
    expect(loadReferenceCache()).toEqual({});
    bodies.map.set("filamentcolors", [{ id: "bad" }]);
    expect(await loadReferenceCatalog("filamentcolors")).toBeNull();
    bodies.map.set("filamentcolors", "nope");
    expect(await loadReferenceCatalog("filamentcolors")).toBeNull();
  });

  test("an earlier version's description with embedded records is dropped to free the space", () => {
    localStorage.setItem(
      "spoolsync:reference-cache",
      JSON.stringify({
        filamentcolors: { key: "abc", fetchedAt: 1, ttlMs: 1, filaments: [{ id: "x" }] },
      }),
    );
    expect(loadReferenceCache()).toEqual({});
    expect(localStorage.getItem("spoolsync:reference-cache")).toBeNull();
  });
});

describe("spools ruled out", () => {
  test("round-trip across visits, drop junk, and store nothing when empty", () => {
    expect(loadReferenceRuledOut()).toEqual([]);
    saveReferenceRuledOut(["spoolman:1", "spoolio:7"]);
    expect(loadReferenceRuledOut()).toEqual(["spoolman:1", "spoolio:7"]);
    localStorage.setItem(
      "spoolsync:reference-ruled-out",
      JSON.stringify(["a", 5, "", "a", "x".repeat(301), null]),
    );
    expect(loadReferenceRuledOut()).toEqual(["a"]);
    localStorage.setItem("spoolsync:reference-ruled-out", "{oops");
    expect(loadReferenceRuledOut()).toEqual([]);
    saveReferenceRuledOut([]);
    expect(localStorage.getItem("spoolsync:reference-ruled-out")).toBeNull();
  });

  test("are listed and forgettable under their own group, and never exported", () => {
    saveReferenceRuledOut(["spoolman:1"]);
    expect(listSavedData().map((item) => item.group.id)).toContain("reference-ruled-out");
    expect(Object.keys(JSON.parse(exportSettings()).entries)).not.toContain(
      "spoolsync:reference-ruled-out",
    );
    expect(forgetGroup("reference-ruled-out")).toBe(1);
    expect(loadReferenceRuledOut()).toEqual([]);
  });
});

describe("accepted changes and choices (this tab only)", () => {
  test("round-trip and drop malformed entries", () => {
    const good = {
      spoolKey: "spoolman:1",
      field: "density" as const,
      before: null,
      after: 1.24,
      providerId: "file",
      referenceId: "r1",
    };
    saveAcceptedReferences([good]);
    expect(sessionStorage.getItem("spoolsync:reference-accepted")).not.toBeNull();
    expect(loadAcceptedReferences()).toEqual([good]);
    sessionStorage.setItem(
      "spoolsync:reference-accepted",
      JSON.stringify([good, { spoolKey: "x" }]),
    );
    expect(loadAcceptedReferences()).toEqual([good]);
    saveAcceptedReferences([]);
    expect(sessionStorage.getItem("spoolsync:reference-accepted")).toBeNull();
    sessionStorage.setItem("spoolsync:reference-accepted", "oops");
    expect(loadAcceptedReferences()).toEqual([]);
  });

  test("choices keep the record picked, or none", () => {
    saveReferenceChoices(
      new Map([
        ["spoolman:1", "r1"],
        ["spoolman:2", "none"],
      ]),
    );
    expect([...loadReferenceChoices()]).toEqual([
      ["spoolman:1", "r1"],
      ["spoolman:2", "none"],
    ]);
    saveReferenceChoices(new Map());
    expect(sessionStorage.getItem("spoolsync:reference-choices")).toBeNull();
  });
});

describe("saved data", () => {
  test("the cache and the tab's choices are listed and forgettable under their own groups", async () => {
    setCatalogBodies(memoryBodies());
    await saveReferenceCacheEntry(entry("filamentcolors"));
    saveReferenceChoices(new Map([["spoolman:1", "r1"]]));
    saveAcceptedReferences([
      {
        spoolKey: "spoolman:1",
        field: "density",
        before: null,
        after: 1.2,
        providerId: "file",
        referenceId: "r1",
      },
    ]);
    const groups = listSavedData().map((item) => item.group.id);
    expect(groups).toContain("reference-cache");
    expect(groups).toContain("inventories");
    expect(forgetGroup("reference-cache")).toBe(1);
    expect(forgetGroup("inventories")).toBe(2);
  });

  test("settings are portable when valid, the cache and choices never are", async () => {
    setCatalogBodies(memoryBodies());
    saveReferenceSettings({
      providerId: "openfilamentdatabase",
      policy: { fields: ["density"], overwrite: [] },
      providers: {},
    });
    await saveReferenceCacheEntry(entry("filamentcolors"));
    saveReferenceChoices(new Map([["spoolman:1", "r1"]]));
    const document = JSON.parse(exportSettings());
    expect(Object.keys(document.entries)).toEqual(["spoolsync:reference-settings"]);

    localStorage.clear();
    const result = importSettings(
      JSON.stringify({
        format: "spoolsync-settings",
        version: 1,
        entries: {
          "spoolsync:reference-settings": JSON.stringify({ providerId: "nope" }),
          "spoolsync:reference-cache": "{}",
        },
      }),
    );
    expect(result.imported).toEqual([]);
    expect(result.skipped.sort()).toEqual([
      "spoolsync:reference-cache",
      "spoolsync:reference-settings",
    ]);
    expect(importSettings(JSON.stringify(document)).imported).toEqual([
      "spoolsync:reference-settings",
    ]);
    expect(loadReferenceSettings().providerId).toBe("openfilamentdatabase");
  });
});

describe("browser sleep", () => {
  test("resolves after the delay and rejects when aborted", async () => {
    expect(await sleep(1)).toBeUndefined();
    const controller = new AbortController();
    const waiting = sleep(10_000, controller.signal);
    controller.abort();
    expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(sleep(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
