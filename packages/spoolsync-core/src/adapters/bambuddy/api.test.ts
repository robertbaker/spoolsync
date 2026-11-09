import { expect, test } from "bun:test";

import {
  BambuddyClient,
  loadBambuddyApi,
  loadBambuddyInventory,
  loadBambuddyFile,
  type BambuddyInventoryClient,
} from ".";

const isSpoolmanProbe = (url: string) => url.endsWith("/api/v1/spoolman/inventory/spools");
const connection = { baseUrl: "https://bambuddy.test", apiKey: "test-key" };

test.each([
  ["an empty Spoolman list", () => Response.json([]), true],
  ["Spoolman being unreachable", () => new Response(null, { status: 503 }), true],
  ["Spoolman being switched off", () => new Response(null, { status: 400 }), false],
  ["an older server without the route", () => new Response(null, { status: 404 }), false],
  ["a key that may not read it", () => new Response(null, { status: 403 }), false],
  ["a catch-all page", () => new Response("<html></html>"), false],
])("Bambuddy Spoolman detection handles %s", async (_name, answer, expected) => {
  expect(await new BambuddyClient(connection, async () => answer()).usesSpoolman()).toBe(expected);
});

test("Bambuddy API loading is refused when Spoolman holds the inventory", async () => {
  await expect(
    loadBambuddyApi(connection, async () => Response.json([{ id: 1, material: "PLA" }])),
  ).rejects.toThrow("Connect SpoolSync to Spoolman");
});

test("Bambuddy API loading supports an injected transport and retains connection identity", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const records = [
    {
      id: 0,
      material: "PLA",
      label_weight: 1000,
      weight_used: 125,
      cost_per_kg: 20,
    },
  ];
  const loaded = await loadBambuddyApi(
    { baseUrl: " https://bambuddy.test/ ", apiKey: "test-key" },
    async (url, init) => {
      if (isSpoolmanProbe(url)) return new Response(null, { status: 400 });
      calls.push({ url, init });
      return Response.json({ items: records });
    },
  );
  expect(calls).toEqual([
    {
      url: "https://bambuddy.test/api/v1/inventory/spools?include_archived=true",
      init: { headers: { "X-API-Key": "test-key" } },
    },
  ]);
  expect(loaded.origin).toBe("api");
  expect(loaded.connectionId).toBe("https://bambuddy.test");
  expect(loaded.spools).toEqual(loadBambuddyFile(JSON.stringify(records)).spools);
  expect(loaded.spools[0]!.remainingWeight).toBe(875);
  expect(loaded.spools[0]!.price).toBe(20);
});

test("Bambuddy inventory workflow accepts a client without HTTP or credentials", async () => {
  const records = [{ id: 2, material: "PETG", cost_per_kg: 20 }];
  const client: BambuddyInventoryClient = {
    baseUrl: "https://bambuddy.test",
    async listSpools() {
      return records;
    },
    async usesSpoolman() {
      return false;
    },
  };
  const loaded = await loadBambuddyInventory(client);
  expect(loaded.spools[0]!.price).toBeNull();
  expect(loaded.warnings).toEqual(loadBambuddyFile(JSON.stringify(records)).warnings);
  expect(loaded.warnings[0]).toContain("label weight is missing");
  expect(records).toEqual([{ id: 2, material: "PETG", cost_per_kg: 20 }]);
});

test("Bambuddy injected transport preserves HTTP errors and duplicate record validation", async () => {
  expect(
    loadBambuddyApi(connection, async () => new Response(null, { status: 403 })),
  ).rejects.toThrow("Bambuddy returned HTTP 403");
  expect(
    loadBambuddyApi(connection, async (url) =>
      isSpoolmanProbe(url)
        ? new Response(null, { status: 400 })
        : Response.json([
            { id: 1, material: "PLA" },
            { id: 1, material: "PETG" },
          ]),
    ),
  ).rejects.toThrow('Duplicate Bambuddy record ID "1"');
});
