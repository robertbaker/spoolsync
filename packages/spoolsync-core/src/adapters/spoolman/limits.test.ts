import { describe, expect, test } from "bun:test";

import { makeSpool } from "../../core/testing";
import { applyToSpoolman } from "./apply";
import { SpoolmanClient } from "./client";
import { createFakeSpoolman } from "./fake-server";
import { temperatureParams } from "./filament-policy";
import { limitText } from "./limits";

const long = "x".repeat(70);

describe("limitText", () => {
  test("cuts by code point and warns once", () => {
    const warnings: string[] = [];
    const emoji = "😀".repeat(70);
    const cut = limitText("location", emoji, (text) => warnings.push(text));
    expect(Array.from(cut)).toHaveLength(64);
    expect(warnings).toEqual([
      "location was shortened to 64 characters, the most Spoolman accepts",
    ]);
    expect(limitText("location", "short", (text) => warnings.push(text))).toBe("short");
    expect(limitText("location", null)).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});

test("creating a spool shortens over-long text and keeps the Spoolstock link", async () => {
  const server = createFakeSpoolman({ vendors: [], filaments: [], spools: [] });
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl);
  const log = await applyToSpoolman(client, [
    {
      kind: "create",
      source: "spoolman",
      groupId: "new",
      values: makeSpool("spoolio", "new", {
        vendor: long,
        material: long,
        name: long,
        location: long,
        lotNr: long,
        upc: long,
      }),
      links: { spoolstockShortId: "abc123" },
      groupIds: {},
    },
  ]);
  expect(log[0]?.ok).toBe(true);
  const created = [...server.spools.values()][0]!;
  expect(created.location).toHaveLength(64);
  expect(created.lot_nr).toHaveLength(64);
  expect(created.filament.name).toHaveLength(64);
  expect(created.filament.material).toHaveLength(64);
  expect(created.filament.article_number).toHaveLength(64);
  expect(created.filament.vendor?.name).toHaveLength(64);
  expect(created.extra?.spoolstock_short_id).toBeDefined();
  expect(log[0]?.message).toContain("shortened to 64 characters");
});

describe("temperatureParams", () => {
  test("rounds fractional temperatures to whole degrees", () => {
    const temps = {
      nozzleTempMin: 205.4,
      nozzleTempMax: 214.6,
      bedTempMin: 59.5,
      bedTempMax: null,
    };
    expect(temperatureParams(temps, true)).toEqual({
      settings_extruder_temp: 210,
      settings_bed_temp: 60,
      settings_extruder_temp_min: 205,
      settings_extruder_temp_max: 215,
      settings_bed_temp_min: 60,
      settings_bed_temp_max: null,
    });
  });
});

describe("403 responses", () => {
  const client = (response: () => Response, token?: string) =>
    new SpoolmanClient({ baseUrl: "http://spoolman.test", ...(token ? { token } : {}) }, async () =>
      response(),
    );
  test("surface the server's own message", async () => {
    const message = "Set SPOOLMAN_CORS_ORIGIN if this origin should be allowed.";
    const result = client(
      () => new Response(JSON.stringify({ message }), { status: 403 }),
      "secret",
    ).info();
    expect(result).rejects.toMatchObject({ kind: "auth", status: 403 });
    expect(result).rejects.toThrow(message);
  });
  test("401 keeps the token wording", async () => {
    expect(client(() => new Response("{}", { status: 401 }), "secret").info()).rejects.toThrow(
      "Spoolman rejected the token",
    );
  });
});

test("list paging asks for a stable id order", async () => {
  const urls: string[] = [];
  const spoolman = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, async (input) => {
    urls.push(String(input));
    return new Response("[]");
  });
  await spoolman.listVendors();
  expect(new URL(urls[0]!).searchParams.get("sort")).toBe("id:asc");
});
