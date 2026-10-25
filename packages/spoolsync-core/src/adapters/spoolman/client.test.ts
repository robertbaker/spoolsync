import { expect, test } from "bun:test";

import { SpoolmanClient } from "./client";

test("unauthorized responses report authentication errors without waiting for their body", async () => {
  for (const status of [401, 403]) {
    let cancelled = false;
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test", timeoutMs: 20 },
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener(
                "abort",
                () => controller.error(new Error("aborted")),
                { once: true },
              );
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status },
        ),
    );
    await expect(client.info()).rejects.toMatchObject({ kind: "auth", status });
    expect(cancelled).toBe(true);
  }
});

test("non-Error transport failures still include a useful message", async () => {
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, async () => {
    throw "connection reset";
  });
  await expect(client.info()).rejects.toMatchObject({
    kind: "network",
    message: "Could not reach Spoolman at http://spoolman.test: connection reset",
  });
});

test("a server ignoring pagination fails instead of repeating pages forever", async () => {
  let requests = 0;
  const vendors = Array.from({ length: 1000 }, (_, id) => ({ id, name: `Vendor ${id}` }));
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, async () => {
    requests++;
    if (requests > 2) throw new Error("Pagination should have stopped already");
    return new Response(JSON.stringify(vendors));
  });
  await expect(client.listVendors()).rejects.toMatchObject({ kind: "parse" });
  expect(requests).toBe(2);
});

test("duplicate IDs inside one page are rejected", async () => {
  const client = new SpoolmanClient(
    { baseUrl: "http://spoolman.test" },
    async () =>
      new Response(
        JSON.stringify([
          { id: 1, name: "First" },
          { id: 1, name: "Second" },
        ]),
      ),
  );
  await expect(client.listVendors()).rejects.toMatchObject({ kind: "parse" });
});

test("request timeout includes a stalled successful response body", async () => {
  let aborted = false;
  const client = new SpoolmanClient(
    { baseUrl: "http://spoolman.test", timeoutMs: 20 },
    async (_input, init) => {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"version":'));
            init!.signal!.addEventListener(
              "abort",
              () => {
                aborted = true;
                controller.error(new Error("aborted"));
              },
              { once: true },
            );
          },
        }),
      );
    },
  );
  await expect(client.info()).rejects.toMatchObject({ kind: "timeout" });
  expect(aborted).toBe(true);
});

test("request timeout also covers a stalled HTTP error body", async () => {
  const client = new SpoolmanClient(
    { baseUrl: "http://spoolman.test", timeoutMs: 20 },
    async (_input, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init!.signal!.addEventListener("abort", () => controller.error(new Error("aborted")), {
              once: true,
            });
          },
        }),
        { status: 503 },
      ),
  );
  await expect(client.info()).rejects.toMatchObject({ kind: "timeout" });
});

test("malformed JSON is still reported as a parse error", async () => {
  const client = new SpoolmanClient(
    { baseUrl: "http://spoolman.test" },
    async () => new Response("not json"),
  );
  await expect(client.info()).rejects.toMatchObject({ kind: "parse" });
});

test("body transport failures are network errors", async () => {
  const client = new SpoolmanClient(
    { baseUrl: "http://spoolman.test" },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection reset"));
          },
        }),
      ),
  );
  await expect(client.info()).rejects.toMatchObject({ kind: "network" });
});
