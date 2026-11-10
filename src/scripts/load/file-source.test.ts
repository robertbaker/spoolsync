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

const doc = (brand: string) => JSON.stringify({ version: 1, filaments: [{ id: "a", brand }] });

function gated(name: string, text: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const read = {
    name,
    size: 10,
    text: async () => {
      await gate;
      return text;
    },
  } as unknown as File;
  return { read, release };
}

const message = () => document.getElementById("spoolio-message")?.textContent ?? "";

test("the newest-started read wins even when it finishes before an older one", async () => {
  const ctx = context();
  const older = gated("old.json", doc("Older"));
  const first = readInventoryFile("spoolio", older.read, ctx);
  const second = readInventoryFile("spoolio", file(doc("Newer")), ctx);
  const winner = await second;
  expect(JSON.stringify(winner)).toContain("Newer");
  older.release();
  expect(await first).toBeNull();
  expect(ctx.state.results.get("spoolio")).toBe(winner!);
  expect(message()).toContain("Loaded 1 spool from inventory.json");
});

test("an older read that finishes first is replaced by the newer one", async () => {
  const ctx = context();
  const newer = gated("new.json", doc("Newer"));
  const first = readInventoryFile("spoolio", file(doc("Older")), ctx);
  const second = readInventoryFile("spoolio", newer.read, ctx);
  expect(await first).not.toBeNull();
  newer.release();
  const winner = await second;
  expect(JSON.stringify(winner)).toContain("Newer");
  expect(ctx.state.results.get("spoolio")).toBe(winner!);
});

test("a newer read that fails does not discard a valid older read", async () => {
  const ctx = context();
  const older = gated("good.json", doc("Good"));
  const first = readInventoryFile("spoolio", older.read, ctx);
  expect(await readInventoryFile("spoolio", file("not json"), ctx)).toBeNull();
  older.release();
  const loaded = await first;
  expect(JSON.stringify(loaded)).toContain("Good");
  expect(ctx.state.results.get("spoolio")).toBe(loaded!);
  expect(message()).toContain("Loaded 1 spool from good.json");
  expect(message()).not.toContain("still available");
});

test("an older failing read stays silent while a newer one owns the panel", async () => {
  const ctx = context();
  const bad = gated("bad.json", "not json");
  const first = readInventoryFile("spoolio", bad.read, ctx);
  const loaded = await readInventoryFile("spoolio", file(doc("Good")), ctx);
  bad.release();
  expect(await first).toBeNull();
  expect(ctx.state.results.get("spoolio")).toBe(loaded!);
  expect(message()).toContain("Loaded 1 spool");
  expect(message()).not.toContain("No spools found");
});

test("a read displaced by a cancelled server load says it was not loaded", async () => {
  const ctx = context();
  const pending = gated("late.json", doc("Late"));
  const read = readInventoryFile("spoolio", pending.read, ctx);
  // A server load starts and is cancelled while the file is still being read.
  ctx.state.nextRevision("spoolio");
  document.getElementById("spoolio-message")!.replaceChildren("Cancelled. Nothing was loaded.");
  ctx.state.nextRevision("spoolio");
  pending.release();
  expect(await read).toBeNull();
  expect(message()).toContain("Cancelled. Nothing was loaded.");
  expect(message()).toContain("late.json was not loaded");
  expect(message()).toContain("changed while the file was read");
  expect(ctx.state.results.has("spoolio")).toBe(false);
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
