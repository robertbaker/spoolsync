import { expect, test } from "bun:test";

import { createTtag, type ConverterDependencies } from "./convert";
import { loadSpools } from "./spools";
import type { CliOptions } from "./types";

const options: CliOptions = { timeout: 1000, includeArchived: false, input: "inventory.json" };

test("the standalone converter accepts reference and runtime dependencies without reading disk", async () => {
  const references: string[] = [];
  const dependencies: ConverterDependencies = {
    async loadReference(filename) {
      references.push(filename);
      return filename === "id_brand.json"
        ? [{ id: 10, name: "Acme" }]
        : [{ id: 20, label: "PLA", material_type: "PLA" }];
    },
    runtime: {
      now: () => Date.UTC(2026, 0, 1),
      randomUUID: () => "12345678-abcd-4000-8000-123456789abc",
    },
  };
  const spools = [
    {
      id: 1,
      filament: { name: "Black", material: "PLA", vendor: "Acme" },
      initial_weight: 1000,
      remaining_weight: 600,
    },
    { id: 2, archived: true },
  ];
  const result = await createTtag(spools, options, dependencies);
  expect(references).toEqual(["id_brand.json", "id_material.json"]);
  expect(result.skipped).toEqual(["2"]);
  expect(result.file.exportedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(result.file.records[0]).toMatchObject({
    uid: "TigerData_12345678abcd40008000123456789abc",
    id_brand: 10,
    id_material: 20,
    weight_available: 600,
  });
  expect(await createTtag(spools, options, dependencies)).toEqual(result);
  expect(spools[0]!.remaining_weight).toBe(600);
});

test("converter file loading can use injected input without accessing the network", async () => {
  const spools = await loadSpools(options, {
    readText: async () => '{"spools":[{"id":1,"filament.name":"Black"}]}',
    fetch: async () => {
      throw new Error("Unexpected network request");
    },
    log: () => {
      throw new Error("Unexpected fetch log");
    },
  });
  expect(spools).toEqual([{ id: 1, filament: { name: "Black" } }]);
});

test("converter API loading preserves authorization, paging parameters, and redirect policy", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const spools = await loadSpools(
    { timeout: 1000, includeArchived: false, url: "https://spoolman.test/", token: "test-token" },
    {
      readText: async () => {
        throw new Error("Unexpected file read");
      },
      async fetch(url, init) {
        calls.push({ url: url.toString(), init });
        return Response.json([{ id: 1, filament: {} }]);
      },
      log: () => {},
    },
  );
  expect(spools).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://spoolman.test/api/v1/spool?limit=1000&offset=0");
  expect(calls[0]!.init?.headers).toEqual({
    accept: "application/json",
    authorization: "Bearer test-token",
  });
  expect(calls[0]!.init?.redirect).toBe("error");
  expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
});
