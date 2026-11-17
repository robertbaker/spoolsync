import { expect, mock, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";

import { LoadState } from "./state";

const inventory: LoadResult = {
  source: "spoolman",
  spools: [],
  warnings: [],
  loadedAt: "now",
};

test("load revisions invalidate older operations only for the affected source", () => {
  const clearLoadResult = mock(() => {});
  const state = new LoadState({
    readLoadResult: () => inventory,
    saveLoadResult: () => true,
    clearLoadResult,
  });
  state.restore("spoolman");
  const first = state.nextRevision("spoolman");
  const other = state.nextRevision("spoolio");
  const latest = state.nextRevision("spoolman");
  expect(state.isCurrent("spoolman", first)).toBe(false);
  expect(state.isCurrent("spoolman", latest)).toBe(true);
  expect(state.isCurrent("spoolio", other)).toBe(true);
  state.unload("spoolman");
  expect(state.isCurrent("spoolman", latest)).toBe(false);
  expect(state.results.has("spoolman")).toBe(false);
  expect(clearLoadResult).toHaveBeenCalledWith("spoolman");
});

test("failed persistence retains the current inventory on the page", () => {
  const saveLoadResult = mock(() => false);
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult,
    clearLoadResult: () => {},
  });
  expect(state.store(inventory)).toBe(false);
  expect(state.results.get("spoolman")).toBe(inventory);
  expect(saveLoadResult).toHaveBeenCalledWith(inventory);
});

test("bumping a revision without unloading rejects in-flight loads and keeps results", () => {
  const state = new LoadState({
    readLoadResult: () => inventory,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  state.restore("spoolman");
  const inFlight = state.nextRevision("spoolman");
  state.nextRevision("spoolman");
  expect(state.isCurrent("spoolman", inFlight)).toBe(false);
  expect(state.results.get("spoolman")).toBe(inventory);
});

test("unload all invalidates a pending load for a service with no inventory yet", () => {
  const cleared: string[] = [];
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: (source) => void cleared.push(source),
  });
  state.store(inventory);
  const pending = state.nextRevision("spoolio");

  expect(state.unloadAll()).toEqual(["spoolman"]);
  expect(state.isCurrent("spoolio", pending, "api")).toBe(false);
  expect(state.results.size).toBe(0);
  expect(cleared).toContain("spoolio");
});

test("invalidating the API rejects server loads in flight but not file loads", () => {
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  const server = state.nextRevision("spoolman");
  state.invalidateApi("spoolman");
  expect(state.isCurrent("spoolman", server, "api")).toBe(false);
  expect(state.isCurrent("spoolman", server)).toBe(true);
  // A server load started afterwards is valid again.
  const later = state.nextRevision("spoolman");
  expect(state.isCurrent("spoolman", later, "api")).toBe(true);
  // A file load in flight when the connection changes survives.
  const file = state.currentRevision("spoolman");
  state.invalidateApi("spoolman");
  expect(state.isCurrent("spoolman", file)).toBe(true);
  expect(state.isCurrent("spoolman", file, "api")).toBe(false);
});
