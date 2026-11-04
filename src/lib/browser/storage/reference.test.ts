import { afterEach, describe, expect, test } from "bun:test";

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
  loadReferenceChoices,
  loadReferenceSettings,
  saveAcceptedReferences,
  saveReferenceCacheEntry,
  saveReferenceChoices,
  saveReferenceSettings,
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
  filaments: Array.from({ length: count }, (_, index) => ({ ...filament(`f${index}`), providerId })),
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

describe("reference cache", () => {
  test("keeps one entry per provider and clears them separately", () => {
    expect(saveReferenceCacheEntry(entry("filamentcolors"))).toBe(true);
    expect(saveReferenceCacheEntry(entry("openfilamentdatabase"))).toBe(true);
    expect(Object.keys(loadReferenceCache()).sort()).toEqual(["filamentcolors", "openfilamentdatabase"]);
    clearReferenceCache("filamentcolors");
    expect(Object.keys(loadReferenceCache())).toEqual(["openfilamentdatabase"]);
    clearReferenceCache();
    expect(localStorage.getItem("spoolsync:reference-cache")).toBeNull();
    clearReferenceCache("never-stored");
  });

  test("a catalog too large to store is not cached and nothing is broken", () => {
    expect(saveReferenceCacheEntry(entry("filamentcolors", 20_001))).toBe(false);
    expect(localStorage.getItem("spoolsync:reference-cache")).toBeNull();
    expect(loadReferenceCache()).toEqual({});
  });

  test("damaged storage reads as empty", () => {
    localStorage.setItem("spoolsync:reference-cache", "oops");
    expect(loadReferenceCache()).toEqual({});
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
    sessionStorage.setItem("spoolsync:reference-accepted", JSON.stringify([good, { spoolKey: "x" }]));
    expect(loadAcceptedReferences()).toEqual([good]);
    saveAcceptedReferences([]);
    expect(sessionStorage.getItem("spoolsync:reference-accepted")).toBeNull();
    sessionStorage.setItem("spoolsync:reference-accepted", "oops");
    expect(loadAcceptedReferences()).toEqual([]);
  });

  test("choices keep the record picked, or none", () => {
    saveReferenceChoices(new Map([["spoolman:1", "r1"], ["spoolman:2", "none"]]));
    expect([...loadReferenceChoices()]).toEqual([["spoolman:1", "r1"], ["spoolman:2", "none"]]);
    saveReferenceChoices(new Map());
    expect(sessionStorage.getItem("spoolsync:reference-choices")).toBeNull();
  });
});

describe("saved data", () => {
  test("the cache and the tab's choices are listed and forgettable under their own groups", () => {
    saveReferenceCacheEntry(entry("filamentcolors"));
    saveReferenceChoices(new Map([["spoolman:1", "r1"]]));
    saveAcceptedReferences([
      { spoolKey: "spoolman:1", field: "density", before: null, after: 1.2, providerId: "file", referenceId: "r1" },
    ]);
    const groups = listSavedData().map((item) => item.group.id);
    expect(groups).toContain("reference-cache");
    expect(groups).toContain("inventories");
    expect(forgetGroup("reference-cache")).toBe(1);
    expect(forgetGroup("inventories")).toBe(2);
  });

  test("settings are portable when valid, the cache and choices never are", () => {
    saveReferenceSettings({
      providerId: "openfilamentdatabase",
      policy: { fields: ["density"], overwrite: [] },
      providers: {},
    });
    saveReferenceCacheEntry(entry("filamentcolors"));
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
    expect(result.skipped.sort()).toEqual(["spoolsync:reference-cache", "spoolsync:reference-settings"]);
    expect(importSettings(JSON.stringify(document)).imported).toEqual(["spoolsync:reference-settings"]);
    expect(loadReferenceSettings().providerId).toBe("openfilamentdatabase");
  });
});

describe("browser sleep", () => {
  test("resolves after the delay and rejects when aborted", async () => {
    await expect(sleep(1)).resolves.toBeUndefined();
    const controller = new AbortController();
    const waiting = sleep(10_000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await expect(sleep(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
