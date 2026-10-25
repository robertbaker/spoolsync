import { expect, mock, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";

import { wireRemoteSource } from "./remote-source";
import { LoadState } from "./state";

const inventory: LoadResult = { source: "spoolman", spools: [], warnings: [], loadedAt: "now" };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fixture() {
  let resolve!: (value: LoadResult) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<LoadResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  const store = mock((result: LoadResult) => {
    state.store(result);
  });
  const button = document.createElement("button");
  const message = document.createElement("div");
  const success = mock(() => {
    const loaded = document.createElement("span");
    loaded.textContent = "Loaded";
    return [loaded];
  });
  wireRemoteSource(
    { state, store },
    {
      source: "spoolman",
      button,
      message,
      prepare: () => ({ loading: document.createElement("span"), load: () => pending, success }),
    },
  );
  button.click();
  return { state, store, button, message, success, resolve, reject };
}

test("remote loads publish successful results and restore the fetch button", async () => {
  const f = fixture();
  expect(f.button.disabled).toBe(true);
  f.resolve(inventory);
  await flush();
  expect(f.store).toHaveBeenCalledWith(inventory);
  expect(f.message.textContent).toBe("Loaded");
  expect(f.button.disabled).toBe(false);
});

test("an older API response cannot replace a newer file inventory or its message", async () => {
  const f = fixture();
  f.state.nextRevision("spoolman");
  const newer = { ...inventory, loadedAt: "newer" };
  f.state.store(newer);
  f.message.textContent = "New file loaded";
  f.resolve(inventory);
  await flush();
  expect(f.state.results.get("spoolman")).toBe(newer);
  expect(f.store).not.toHaveBeenCalled();
  expect(f.success).not.toHaveBeenCalled();
  expect(f.message.textContent).toBe("New file loaded");
});

test("unloading invalidates an outstanding API failure", async () => {
  const f = fixture();
  f.state.unload("spoolman");
  f.message.textContent = "";
  f.reject(new Error("Old request failed"));
  await flush();
  expect(f.message.textContent).toBe("");
  expect(f.state.results.has("spoolman")).toBe(false);
  expect(f.store).not.toHaveBeenCalled();
  expect(f.button.disabled).toBe(false);
});

test("a current failure preserves inventory and displays its error", async () => {
  const f = fixture();
  f.state.store(inventory);
  f.reject(new Error("Server unavailable"));
  await flush();
  expect(f.message.textContent).toContain("Could not load Spoolman");
  expect(f.message.textContent).toContain("Server unavailable");
  expect(f.state.results.get("spoolman")).toBe(inventory);
  expect(f.store).not.toHaveBeenCalled();
});
