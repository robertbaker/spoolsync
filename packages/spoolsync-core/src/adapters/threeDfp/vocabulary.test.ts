import { describe, expect, test } from "bun:test";

import { exportThreeDfp, loadThreeDfpFile } from ".";
import { buildPlan, type PlannedUpdate } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { commonMaterialAndFinish, rowMaterial } from "./vocabulary";

const row = (extra: Record<string, unknown> = {}) => ({
  short_code: "AAA111",
  brand: "Synth",
  material: "PLA",
  material_type: "Basic",
  color: "Teal",
  rgb: "#008080",
  notes: "",
  remaining_grams: 500,
  ...extra,
});
const load = (extra: Record<string, unknown> = {}) =>
  loadThreeDfpFile(JSON.stringify([row(extra)]));

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

const exported = (
  extra: Record<string, unknown>,
  changes: PlannedUpdate["changes"],
): { row: Record<string, unknown>; warnings: string[] } => {
  const loaded = load(extra);
  const output = exportThreeDfp(loaded, [update(loaded, changes)]);
  return { row: JSON.parse(output.json)[0], warnings: output.warnings };
};

describe("3DFilamentProfiles material and finish vocabulary", () => {
  test("a product line goes into the compound material, never into the finish", () => {
    const cases: Array<[string | null, string | null, string | null, string | null]> = [
      ["PLA", "Basic", "PLA", null],
      ["PLA", "High Speed", "HSPLA", null],
      ["PETG", "High Speed", "HSPETG", null],
      ["PLA", "Ultra", "PLA-Ultra", null],
      ["PLA", "Matte", "PLA", "Matte"],
      ["PLA", "silk", "PLA", "Silk"],
      ["PLA", "Matt", "PLA", "Matte"],
      ["PLA", "", "PLA", null],
      ["PLA", "Pro", "PLA-Pro", null],
      [null, "Ultra", null, null],
    ];
    for (const [material, type, expectedMaterial, expectedFinish] of cases)
      expect(commonMaterialAndFinish(material, type)).toEqual({
        material: expectedMaterial,
        finish: expectedFinish,
      });
    const spool = load({ material: "PETG", material_type: "High Speed" }).spools[0]!;
    expect(spool).toMatchObject({ material: "HSPETG", finish: null });
  });

  test("columns are rebuilt from the common material and finish", () => {
    expect(rowMaterial({ material: "HSPLA", finish: null }, { materialType: "Basic" })).toEqual({
      material: "PLA",
      materialType: "High Speed",
    });
    expect(rowMaterial({ material: "PLA-Ultra" }, { materialType: "Basic" })).toMatchObject({
      material: "PLA",
      materialType: "Ultra",
    });
    expect(rowMaterial({ material: "PLA", finish: "Matte" }, { materialType: "Basic" })).toEqual({
      material: "PLA",
      materialType: "Matte",
    });
    expect(rowMaterial({ material: "PLA-CF", finish: null }, { materialType: "Basic" })).toEqual({
      material: "PLA-CF",
      materialType: "Basic",
    });
    expect(
      rowMaterial({ material: "PLA", finish: "Multicolor, Silk" }, { materialType: "" }),
    ).toMatchObject({ materialType: "Silk" });
  });

  test("loading then writing the common values gives back the same columns", () => {
    for (const [material, type] of [
      ["PLA", "Basic"],
      ["PETG", "High Speed"],
      ["PLA", "Ultra"],
      ["PLA", "Matte"],
      ["PLA", "Silk"],
    ] as const) {
      const common = commonMaterialAndFinish(material, type);
      const written = rowMaterial(common, { materialType: null });
      expect([written.material, written.materialType]).toEqual([material, type]);
    }
  });

  test("updating the material or finish writes both columns and keeps the rest", () => {
    const line = exported({}, [{ field: "material", from: "PLA", to: "HSPETG" }]);
    expect(line.row).toMatchObject({ material: "PETG", material_type: "High Speed" });
    const finish = exported({}, [{ field: "finish", from: null, to: "Silk" }]);
    expect(finish.row).toMatchObject({ material: "PLA", material_type: "Silk" });
    const cleared = exported({ material_type: "Silk" }, [
      { field: "finish", from: "Silk", to: null },
    ]);
    expect(cleared.row).toMatchObject({ material: "PLA", material_type: "Basic" });
  });

  test("a finish update keeps the row's own product line when it has no finish to give up", () => {
    const kept = exported({ material_type: "Ultra" }, [{ field: "finish", from: null, to: null }]);
    expect(kept.row["material_type"]).toBe("Ultra");
    const unknown = exported({ material_type: "Pro" }, [
      { field: "remainingWeight", from: 500, to: 400 },
    ]);
    expect(unknown.row["material_type"]).toBe("Pro");
  });

  test("a finish and a product line cannot both be stored, so the line is reported", () => {
    const { row: written, warnings } = exported({}, [
      { field: "material", from: "PLA", to: "PLA-Ultra-Matte" },
      { field: "finish", from: null, to: "Matte" },
    ]);
    expect(written).toMatchObject({ material: "PLA", material_type: "Matte" });
    expect(warnings.join("\n")).toContain("product line Ultra was not");
  });

  test("created rows rebuild the columns from the common values", () => {
    const { groups } = matchSpools([
      makeSpool("spoolman", "1", { material: "HSPLA", finish: "Matte" }),
      makeSpool("spoolman", "2", { material: "PLA-Ultra", finish: null }),
    ]);
    const changes = buildPlan(
      groups,
      new Map(groups.map((group) => [group.id, { values: {}, createIn: ["threeDfp"] as const }])),
    ).get("threeDfp")!;
    const output = exportThreeDfp(loadThreeDfpFile("[]"), changes);
    const rows = JSON.parse(output.json) as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r["material"], r["material_type"]]).toSorted()).toEqual([
      ["PLA", "Matte"],
      ["PLA", "Ultra"],
    ]);
    expect(output.warnings.join("\n")).toContain("product line High Speed was not");
  });
});

describe("3DFilamentProfiles price and notes", () => {
  test("a price of 0 is unset", () => {
    expect(load({ spool_purchase_price: 0 }).spools[0]!.price).toBeNull();
    expect(load({ spool_properties: { purchase_price: 0 } }).spools[0]!.price).toBeNull();
    expect(load({ spool_purchase_price: 12.5 }).spools[0]!.price).toBe(12.5);
  });

  test("a notes update keeps the Lot line where it was", () => {
    const edit = (notes: string) =>
      exported({ notes }, [{ field: "comment", from: "x", to: "New note" }]).row["notes"];
    expect(edit("Lot: L1\nOld")).toBe("Lot: L1\nNew note");
    expect(edit("Old\nLot: L1")).toBe("New note\nLot: L1");
    expect(edit("A\nLot: L1\nB")).toBe("New note\nLot: L1");
    expect(edit("Old")).toBe("New note");
    expect(
      exported({ notes: "Old\nLot: L1" }, [{ field: "comment", from: "Old", to: null }]).row[
        "notes"
      ],
    ).toBe("Lot: L1");
  });
});
