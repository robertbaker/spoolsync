import { afterEach, beforeEach, expect, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";

import { readInventoryFile } from "./file-source";
import { MAX_INVENTORY_FILE_BYTES } from "./presentation";
import { LoadState } from "./state";

const stored: LoadResult[] = [];

function context() {
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  return { state, store: (result: LoadResult) => void state.store(result) };
}

const file = (text: string, size = text.length) =>
  ({ name: "inventory.json", size, text: async () => text }) as unknown as File;

beforeEach(() => {
  stored.length = 0;
  document.body.innerHTML = '<div id="spoolio-message"></div>';
});
afterEach(() => document.body.replaceChildren());

test("an oversize or unreadable file does not cancel an in-flight server load", async () => {
  const ctx = context();
  const server = ctx.state.nextRevision("spoolio");
  expect(
    await readInventoryFile("spoolio", file("x", MAX_INVENTORY_FILE_BYTES + 1), ctx),
  ).toBeNull();
  expect(await readInventoryFile("spoolio", file("not json"), ctx)).toBeNull();
  expect(ctx.state.isCurrent("spoolio", server, "api")).toBe(true);
  expect(ctx.state.results.has("spoolio")).toBe(false);
});

test("a stored file supersedes in-flight server loads and is returned", async () => {
  const ctx = context();
  const server = ctx.state.nextRevision("spoolio");
  const result = await readInventoryFile(
    "spoolio",
    file(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "A" }] })),
    ctx,
  );
  expect(result?.spools).toHaveLength(1);
  expect(ctx.state.results.get("spoolio")).toBe(result!);
  expect(ctx.state.isCurrent("spoolio", server, "api")).toBe(false);
});

test("a failed file returns null even when an older inventory is loaded", async () => {
  const ctx = context();
  const good = await readInventoryFile(
    "spoolio",
    file(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "A" }] })),
    ctx,
  );
  expect(good).not.toBeNull();
  expect(await readInventoryFile("spoolio", file("not json"), ctx)).toBeNull();
  expect(ctx.state.results.get("spoolio")).toBe(good!);
});
