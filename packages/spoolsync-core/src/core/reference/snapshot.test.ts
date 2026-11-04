import { describe, expect, test } from "bun:test";

import type { ReferenceResponse } from "./fetch";
import { parseReferenceFile } from "./file";
import { probeFreshness } from "./freshness";
import { providerById } from "./providers";
import { buildFetchConfig } from "./settings";
import {
  SNAPSHOT_VERSION,
  decodeSnapshot,
  encodeSnapshot,
  snapshotPath,
  type ReferenceSnapshot,
} from "./snapshot";
import type { ReferenceFilament } from "./types";

const filament = (id: string, extra: Partial<ReferenceFilament> = {}): ReferenceFilament => ({
  id,
  providerId: "openfilamentdatabase",
  providerLabel: "Open Filament Database",
  vendor: "Hatchbox",
  name: "PLA Matte",
  material: "PLA",
  colorName: "Terracotta",
  colorHex: "C0623A",
  colorHexes: ["C0623A"],
  diameter: 1.75,
  density: 1.24,
  nozzleTempMin: 190,
  nozzleTempMax: 220,
  bedTempMin: 0,
  bedTempMax: 60,
  initialWeight: 1000,
  emptySpoolWeight: 216,
  price: null,
  barcode: "191314034277",
  url: null,
  sourceUrl: null,
  imageUrl: null,
  dryingTemp: null,
  dryingHours: null,
  buyLinks: [],
  attribution: "Open Filament Database (openfilamentdatabase.org)",
  license: "MIT",
  ...extra,
});

const snapshot = (filaments: ReferenceFilament[]): ReferenceSnapshot => ({
  providerId: "openfilamentdatabase",
  generatedAt: 1_700_000_000_000,
  sourceToken: "2026-11-04T02:16:41Z",
  source: "https://api.openfilamentdatabase.org/json/all.json",
  attribution: "Open Filament Database (openfilamentdatabase.org)",
  license: "MIT",
  skipped: 2,
  filaments,
});

describe("snapshot", () => {
  test("round-trips records, keeping multi-color order and nulls", () => {
    const original = snapshot([
      filament("a"),
      filament("b", {
        colorHex: "F4AC23",
        colorHexes: ["F4AC23", "2E56F1"],
        barcode: null,
        emptySpoolWeight: null,
      }),
    ]);
    const decoded = decodeSnapshot(JSON.parse(encodeSnapshot(original)));
    expect(decoded).toEqual(original);
  });

  test("keeps the source page, image and drying advice, and drops unsafe links", () => {
    const original = snapshot([
      filament("a", {
        sourceUrl: "https://openfilamentdatabase.org/brands/hatchbox/PLA/matte",
        imageUrl: "https://filamentcolors.xyz/media/x.jpg",
        dryingTemp: 45,
        dryingHours: 6,
        buyLinks: [{ store: "Shop", url: "https://shop.example.org/p/1", shipsTo: ["GB", "DE"] }],
      }),
    ]);
    const text = JSON.parse(encodeSnapshot(original));
    expect(decodeSnapshot(text)).toEqual(original);
    text.rows[0][text.columns.indexOf("sourceUrl")] = "javascript:alert(1)";
    text.rows[0][text.columns.indexOf("imageUrl")] = "http://insecure.example.org/x.jpg";
    expect(decodeSnapshot(text)!.filaments[0]).toMatchObject({ sourceUrl: null, imageUrl: null });
    text.rows[0][text.columns.indexOf("buyLinks")] = [
      { store: "Bad", url: "http://insecure.example.org", shipsTo: ["GB"] },
      { store: "", url: "https://ok.example.org", shipsTo: [] },
      { store: "Fine", url: "https://fine.example.org", shipsTo: ["gb", "GBR", 5] },
    ];
    expect(decodeSnapshot(text)!.filaments[0]!.buyLinks).toEqual([
      { store: "Fine", url: "https://fine.example.org/", shipsTo: ["GB"] },
    ]);
  });

  test("is much smaller than the records as objects", () => {
    const many = Array.from({ length: 500 }, (_, i) => filament(`id-${i}`));
    expect(encodeSnapshot(snapshot(many)).length).toBeLessThan(JSON.stringify(many).length / 2);
  });

  test("rejects other versions, unknown or file providers, and empty snapshots", () => {
    const good = JSON.parse(encodeSnapshot(snapshot([filament("a")])));
    expect(decodeSnapshot({ ...good, version: SNAPSHOT_VERSION + 1 })).toBeNull();
    expect(decodeSnapshot({ ...good, providerId: "nope" })).toBeNull();
    expect(decodeSnapshot({ ...good, providerId: "file" })).toBeNull();
    expect(decodeSnapshot({ ...good, rows: [] })).toBeNull();
    expect(decodeSnapshot({ ...good, generatedAt: "now" })).toBeNull();
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot([])).toBeNull();
  });

  test("re-validates every record: bad rows are dropped, unsafe urls and hexes cleaned", () => {
    const good = JSON.parse(encodeSnapshot(snapshot([filament("a"), filament("b")])));
    good.rows[1][good.columns.indexOf("url")] = "http://insecure.example.org";
    good.rows[1][good.columns.indexOf("colorHexes")] = ["zz"];
    good.rows.push("not a row", [null]);
    const decoded = decodeSnapshot(good)!;
    expect(decoded.filaments.map((f) => f.id)).toEqual(["a", "b"]);
    expect(decoded.filaments[1]).toMatchObject({ url: null, colorHex: null, colorHexes: [] });
  });

  test("lives at a stable path per provider", () => {
    expect(snapshotPath("filamentcolors")).toBe("reference/filamentcolors.json");
  });
});

function reply(body: unknown, ok = true): ReferenceResponse {
  return { ok, status: ok ? 200 : 500, headers: { get: () => null }, json: async () => body };
}

describe("freshness", () => {
  test("Open Filament Database: the rebuild time is the token", async () => {
    const urls: string[] = [];
    const token = await probeFreshness(providerById("openfilamentdatabase")!, {
      fetch: async (url) => {
        urls.push(url);
        return reply({ version: "2026.11.04", generated_at: "2026-11-04T02:16:41Z" });
      },
    });
    expect(token).toBe("2026-11-04T02:16:41Z");
    expect(urls[0]).toContain("api.openfilamentdatabase.org");
  });

  test("FilamentColors: total plus the first swatch", async () => {
    const token = await probeFreshness(providerById("filamentcolors")!, {
      fetch: async () =>
        reply({ count: 2256, results: [{ id: 4835, date_published: "2026-07-05T18:39:30Z" }] }),
    });
    expect(token).toBe("2256:4835:2026-07-05T18:39:30Z");
  });

  test("a failed, unreadable or missing check is unknown, never an error", async () => {
    const fc = providerById("filamentcolors")!;
    expect(await probeFreshness(fc, { fetch: async () => reply({}, false) })).toBeNull();
    expect(await probeFreshness(fc, { fetch: async () => reply({ nope: 1 }) })).toBeNull();
    expect(
      await probeFreshness(fc, {
        fetch: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).toBeNull();
    expect(
      await probeFreshness(providerById("file")!, { fetch: async () => reply({}) }),
    ).toBeNull();
  });
});

describe("built-in settings", () => {
  test("only the provider's own address, paging and mapping count as built in", () => {
    const own = buildFetchConfig("filamentcolors", undefined);
    expect(own.ok && own.builtIn).toBe(true);
    const custom = buildFetchConfig("filamentcolors", {
      urlTemplate: "https://filamentcolors.xyz/api/swatch/",
      mapping: {},
      pagination: { kind: "next-link", path: "next" },
      ttlHours: 24,
      minIntervalMs: 0,
      attribution: "",
    });
    expect(custom.ok && custom.builtIn).toBe(false);
  });
});

describe("snapshot files as reference files", () => {
  test("a snapshot downloaded from the site loads like any reference file, keeping its credit line", () => {
    const text = encodeSnapshot(snapshot([filament("a"), filament("b", { barcode: null })]));
    const parsed = parseReferenceFile("openfilamentdatabase.json", text);
    expect(parsed.filaments.map((f) => f.id)).toEqual(["a", "b"]);
    expect(parsed.filaments[0]!.providerId).toBe("openfilamentdatabase");
    expect(parsed.attribution).toBe("Open Filament Database (openfilamentdatabase.org)");
    expect(parsed.license).toBe("MIT");
    expect(parsed.skipped).toBe(2);
    expect(parsed.warnings[0]).toContain("snapshot of 2 records");
  });

  test("a damaged snapshot is not mistaken for a record list", () => {
    const good = JSON.parse(encodeSnapshot(snapshot([filament("a")])));
    expect(() => parseReferenceFile("x.json", JSON.stringify({ ...good, rows: [] }))).toThrow();
  });
});
