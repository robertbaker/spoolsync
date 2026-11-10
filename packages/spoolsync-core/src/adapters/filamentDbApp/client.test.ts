import { afterEach, expect, test } from "bun:test";

import { FilamentDbAppClient } from "./client";

const realDocument = (globalThis as { document?: unknown }).document;
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

const client = (fetchImpl: () => Promise<Response>) =>
  new FilamentDbAppClient({ baseUrl: "http://db.local:3456", fetchImpl });

test("a page is told to add its origin to ALLOWED_ORIGINS when the server rejects it", async () => {
  (globalThis as { document?: unknown }).document = {};
  const rejected = client(async () => new Response("no", { status: 403 }));
  await expect(rejected.snapshot()).rejects.toThrow(/ALLOWED_ORIGINS/);
});

test("a blocked browser request names ALLOWED_ORIGINS as a likely cause", async () => {
  (globalThis as { document?: unknown }).document = {};
  const blocked = client(async () => {
    throw new TypeError("Failed to fetch");
  });
  await expect(blocked.snapshot()).rejects.toThrow(/Could not reach Filament DB.*ALLOWED_ORIGINS/s);
});

test("outside a page a network failure carries no browser advice", async () => {
  (globalThis as { document?: unknown }).document = undefined;
  const down = client(async () => {
    throw new Error("ECONNREFUSED");
  });
  const error = await down.snapshot().catch((caught: Error) => caught);
  expect((error as Error).message).toContain("ECONNREFUSED");
  expect((error as Error).message).not.toContain("ALLOWED_ORIGINS");
});
