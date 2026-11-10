import { describe, expect, test } from "bun:test";

import { exportThreeDfp, loadThreeDfpFile } from ".";
import { buildPlan, type PlannedUpdate } from "../../core/compare";
import { SOURCE_FIELDS } from "../../core/comparison/fields";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";

const json = JSON.stringify([
  {
    short_code: "AAA111",
    brand: "Synth",
    material: "PLA",
    material_type: "Matte",
    color: "Teal",
    rgb: "#008080",
    td_value: 3.4,
    notes: "Lot: spoolstock:spool:410e5312\nDry box",
    remaining_grams: 500,
    filament_id: 77,
    spool_properties: { preferred_nozzle_temp: 200, preferred_bed_temp: 60 },
  },
]);

const csv =
  "short_code,brand,material,material_type,color,rgb,td_value,notes,remaining_grams,spool_preferred_nozzle_temp,spool_preferred_bed_temp\n" +
  "BBB222,Synth,PETG,Basic,Red,#FF0000,5.5,,800,230,70\n";

const update = (
  loaded: ReturnType<typeof loadThreeDfpFile>,
  changes: PlannedUpdate["changes"],
): PlannedUpdate => ({
  kind: "update",
  source: "threeDfp",
  groupId: "g",
  spool: loaded.spools[0]!,
  links: {},
  changes,
});

describe("3DFilamentProfiles finish and TD", () => {
  test("reads material_type as finish and td_value as TD in both formats", () => {
    expect(loadThreeDfpFile(json).spools[0]).toMatchObject({
      finish: "Matte",
      td: 3.4,
      // Existing Lot: note parsing is unchanged.
      lotNr: "spoolstock:spool:410e5312",
      crossIds: { spoolstockShortId: "410e5312" },
      comment: "Dry box",
    });
    expect(loadThreeDfpFile(csv).spools[0]).toMatchObject({
      finish: null,
      td: 5.5,
    });
  });

  test("writes them back to JSON and CSV", () => {
    for (const [text, finishFrom] of [
      [json, "Matte"],
      [csv, null],
    ] as const) {
      const loaded = loadThreeDfpFile(text);
      const output = exportThreeDfp(loaded, [
        update(loaded, [
          { field: "finish", from: finishFrom, to: "Silk" },
          { field: "td", from: loaded.spools[0]!.td, to: 1.2 },
        ]),
      ]);
      const reloaded = loadThreeDfpFile(loaded.format === "json" ? output.json : output.csv);
      expect(reloaded.spools[0]).toMatchObject({ finish: "Silk", td: 1.2 });
      if (loaded.format === "json") {
        const row = JSON.parse(output.json)[0];
        expect(row).toMatchObject({
          material_type: "Silk",
          td_value: 1.2,
          filament_id: 77,
        });
      }
      const cleared = exportThreeDfp(loaded, [
        update(loaded, [
          { field: "finish", from: finishFrom, to: null },
          { field: "td", from: loaded.spools[0]!.td, to: null },
        ]),
      ]);
      const after = loadThreeDfpFile(loaded.format === "json" ? cleared.json : cleared.csv);
      expect(after.spools[0]).toMatchObject({ finish: null, td: null });
    }
  });

  test("a CSV export converted to JSON keeps td_value numeric", () => {
    const loaded = loadThreeDfpFile(csv);
    const output = exportThreeDfp(loaded, [update(loaded, [{ field: "td", from: 5.5, to: 6 }])]);
    expect(JSON.parse(output.json)[0].td_value).toBe(6);
  });

  test("created rows carry finish and TD", () => {
    for (const format of ["json", "csv"] as const) {
      const empty = loadThreeDfpFile(format === "json" ? "[]" : "short_code,brand,material\n");
      const { groups } = matchSpools([
        makeSpool("spoolman", "1", {
          finish: "Satin",
          td: 2.2,
          nozzleTempMax: 240,
        }),
      ]);
      const changes = buildPlan(
        groups,
        new Map([[groups[0]!.id, { values: {}, createIn: ["threeDfp"] }]]),
      ).get("threeDfp")!;
      const output = exportThreeDfp(empty, changes);
      const reloaded = loadThreeDfpFile(format === "json" ? output.json : output.csv);
      expect(reloaded.spools[0]).toMatchObject({ finish: "Satin", td: 2.2 });
    }
  });

  test("enables finish and TD but not lot number", () => {
    expect(SOURCE_FIELDS.threeDfp.has("finish")).toBe(true);
    expect(SOURCE_FIELDS.threeDfp.has("td")).toBe(true);
    expect(SOURCE_FIELDS.threeDfp.has("lotNr")).toBe(false);
  });
});

describe("3DFilamentProfiles preferred temperatures", () => {
  test("a single preference fills both bounds and sits out range comparison", () => {
    expect(loadThreeDfpFile(json).spools[0]).toMatchObject({
      nozzleTempMin: 200,
      nozzleTempMax: 200,
      bedTempMin: 60,
      bedTempMax: 60,
    });
    for (const field of ["nozzleTempMin", "nozzleTempMax", "bedTempMin", "bedTempMax"] as const)
      expect(SOURCE_FIELDS.threeDfp.has(field)).toBe(false);
  });

  test("a created row uses the minimum, or the maximum when that is all there is", () => {
    const empty = loadThreeDfpFile("[]");
    const { groups } = matchSpools([
      makeSpool("spoolman", "1", {
        nozzleTempMin: null,
        nozzleTempMax: 240,
        bedTempMin: 55,
      }),
    ]);
    const changes = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["threeDfp"] }]]),
    ).get("threeDfp")!;
    const row = JSON.parse(exportThreeDfp(empty, changes).json)[0];
    expect(row.spool_properties).toMatchObject({
      preferred_nozzle_temp: 240,
      preferred_bed_temp: 55,
    });
  });
});

describe("3DFilamentProfiles created rows and links", () => {
  const createChanges = (values: Parameters<typeof makeSpool>[2]) => {
    const { groups } = matchSpools([makeSpool("spoolman", "1", values)]);
    return buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["threeDfp"] }]]),
    ).get("threeDfp")!;
  };
  const runtime = (ids: string[]) => ({
    now: () => Date.UTC(2026, 10, 9, 12, 0, 0, 123),
    randomUUID: () => ids.shift() ?? "ffffffff-ffff-ffff-ffff-ffffffffffff",
  });

  test("new JSON rows match the real row shape", () => {
    const row = JSON.parse(
      exportThreeDfp(
        loadThreeDfpFile("[]"),
        createChanges({ vendor: "Synth", remainingWeight: 400 }),
        runtime(["abcdefab-1111-2222-3333-444444444444"]),
      ).json,
    )[0];
    expect(row.short_code).toMatch(/^[0-9A-Za-z]{9}$/);
    expect(row.spool_url).toBe(`https://spooldb.com/s/${row.short_code}`);
    expect(row.updated_at).toBe("2026-11-09T12:00:00.123+00:00");
    expect(row).not.toHaveProperty("filament_id");
    expect(row.empty_spool_weight).toBeNull();
    expect(row.spool_properties).toMatchObject({
      purchase_date: null,
      purchase_price: null,
      last_dried_date: null,
    });
    expect(row.spool_properties).not.toHaveProperty("preferred_bed_temp");
    expect(row.spool_properties).not.toHaveProperty("preferred_nozzle_temp");
  });

  test("a new short code never reuses an existing row's code", () => {
    const first = JSON.parse(
      exportThreeDfp(
        loadThreeDfpFile("[]"),
        createChanges({ vendor: "Synth" }),
        runtime(["abcdefab-1111-2222-3333-444444444444"]),
      ).json,
    )[0].short_code as string;
    const row = JSON.parse(
      exportThreeDfp(
        loadThreeDfpFile(JSON.stringify([{ short_code: first, brand: "Synth" }])),
        createChanges({ vendor: "Synth" }),
        runtime(["abcdefab-1111-2222-3333-444444444444", "bbbbbbbb-2222-3333-4444-555555555555"]),
      ).json,
    )[1];
    expect(row.short_code).toMatch(/^[0-9A-Za-z]{9}$/);
    expect(row.short_code).not.toBe(first);
  });

  test("updates refresh updated_at on rows that carry it", () => {
    const loaded = loadThreeDfpFile(
      JSON.stringify([
        { short_code: "AAA111", brand: "Synth", updated_at: "2020-01-01T00:00:00+00:00" },
      ]),
    );
    const out = exportThreeDfp(
      loaded,
      [
        {
          kind: "update",
          source: "threeDfp",
          groupId: "g",
          spool: loaded.spools[0]!,
          links: {},
          changes: [{ field: "vendor", from: "Synth", to: "Other" }],
        },
      ],
      runtime([]),
    );
    expect(JSON.parse(out.json)[0].updated_at).toBe("2026-11-09T12:00:00.123+00:00");
  });

  test("updates write the Spoolstock link into the notes and keep other notes", () => {
    for (const [text, comment] of [
      [json.replace("Lot: spoolstock:spool:410e5312\\n", ""), "Dry box"],
      [csv, null],
    ] as const) {
      const loaded = loadThreeDfpFile(text);
      const output = exportThreeDfp(loaded, [
        { ...update(loaded, []), links: { spoolstockShortId: "deadbeef" } },
      ]);
      const reloaded = loadThreeDfpFile(loaded.format === "json" ? output.json : output.csv);
      expect(reloaded.spools[0]).toMatchObject({
        lotNr: "spoolstock:spool:deadbeef",
        crossIds: { spoolstockShortId: "deadbeef" },
        comment,
      });
    }
  });

  test("a real lot number is kept and the link is reported as not stored", () => {
    const loaded = loadThreeDfpFile(json.replace("spoolstock:spool:410e5312", "LOT-9"));
    const output = exportThreeDfp(loaded, [
      { ...update(loaded, []), links: { spoolstockShortId: "deadbeef" } },
    ]);
    expect(JSON.parse(output.json)[0].notes).toBe("Lot: LOT-9\nDry box");
    expect(output.warnings.join("\n")).toContain("kept the existing lot number");
  });

  test("warns about repeated IDs at load", () => {
    const row = { short_code: "A", brand: "Synth" };
    expect(loadThreeDfpFile(JSON.stringify([row, row])).warnings).toEqual([
      "Spool A appears more than once; give each spool a unique ID before exporting.",
    ]);
    expect(loadThreeDfpFile("short_code,brand\nA,x\nA,y\n").warnings).toHaveLength(1);
  });
});
