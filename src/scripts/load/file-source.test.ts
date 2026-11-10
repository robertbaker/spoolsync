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

test("the newest-started read wins even when an older one finishes first", async () => {
  const ctx = context();
  const doc = (brand: string) => JSON.stringify({ version: 1, filaments: [{ id: "a", brand }] });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const older = file(doc("Older"));
  const newer = {
    name: "new.json",
    size: 10,
    text: async () => {
      await gate;
      return doc("Newer");
    },
  } as unknown as File;
  const first = readInventoryFile("spoolio", older, ctx);
  const second = readInventoryFile("spoolio", newer, ctx);
  expect(await first).toBeNull();
  release();
  const winner = await second;
  expect(winner?.spools).toHaveLength(1);
  expect(JSON.stringify(winner)).toContain("Newer");
  expect(ctx.state.results.get("spoolio")).toBe(winner!);
});

test("a read superseded by a server load leaves a message rather than a blank panel", async () => {
  const ctx = context();
  const pending = readInventoryFile(
    "spoolio",
    file(JSON.stringify({ version: 1, filaments: [{ id: "a", brand: "A" }] })),
    ctx,
  );
  ctx.state.nextRevision("spoolio");
  expect(await pending).toBeNull();
  expect(document.getElementById("spoolio-message")?.textContent).toContain("was not loaded");
});
