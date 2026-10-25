import { expect, mock, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";

import { LoadState } from "./state";

const inventory: LoadResult = { source: "spoolman", spools: [], warnings: [], loadedAt: "now" };

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
