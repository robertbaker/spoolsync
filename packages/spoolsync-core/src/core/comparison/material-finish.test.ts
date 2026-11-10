import { describe, expect, test } from "bun:test";

import { buildPlan, compareGroup, defaultResolution, mergedValues, valuesEqual } from "../compare";
import { matchSpools } from "../match";
import { isBroaderMaterial, materialsCompatible } from "../material";
import type { SourceId } from "../model";
import { makeSpool } from "../testing";

function group(
  a: { source: SourceId; material?: string | null; finish?: string | null },
  b: { source: SourceId; material?: string | null; finish?: string | null },
) {
  const ids = { spoolmanId: 1, spoolioId: "a", spoolstockShortId: "s" };
  const spools = [a, b].map(({ source, ...values }) =>
    makeSpool(source, source === "spoolman" ? "1" : source === "spoolio" ? "a" : "s", {
      crossIds: ids,
      ...values,
    }),
  );
  return matchSpools(spools).groups[0]!;
}

describe("finish comparison", () => {
  test("ignores word order, spelling and separators", () => {
    expect(valuesEqual("finish", "Silk, Matt", "Matte, Silk")).toBe(true);
    expect(valuesEqual("finish", "Silk/Matte", "matte; silk")).toBe(true);
    expect(valuesEqual("finish", "UV Glow", "Glow In the Dark")).toBe(true);
    expect(valuesEqual("finish", "Matte", "Matte, Silk")).toBe(false);
    expect(valuesEqual("finish", "Multicolor", "Gradient")).toBe(false);
  });

  test("a differently ordered finish is not a difference between services", () => {
    const g = group(
      { source: "spoolio", finish: "Silk, Matt" },
      { source: "spoolstock", finish: "Matte, Silk" },
    );
    expect(compareGroup(g)).toEqual([]);
  });
});

describe("material compatibility", () => {
  test("a base type is broader than its product lines and finishes", () => {
    for (const specific of [
      "PLA-Glow",
      "HSPLA",
      "PLA-Ultra-Matte",
      "PLA+",
      "PLA Silk",
      "PLA-Ultra",
    ])
      expect(isBroaderMaterial("PLA", specific)).toBe(true);
    expect(isBroaderMaterial("PA-CF", "PA6-CF")).toBe(true);
    expect(isBroaderMaterial("PETG", "PETG+")).toBe(true);
    expect(isBroaderMaterial("PLA-Ultra", "PLA-Ultra-Matte")).toBe(true);
    expect(isBroaderMaterial("PLA-Ultra-Matte", "PLA")).toBe(false);
  });

  test("different materials stay different", () => {
    const pairs = [
      ["PETG", "PLA"],
      ["PA6", "PA12"],
      ["ABS", "ASA"],
      ["PLA", "PLA-CF"],
      ["PLA", "PETG-Matte"],
      ["PLA-Ultra", "HSPLA"],
      ["Foo", "Foo-Matte"],
    ] as const;
    for (const [a, b] of pairs) expect(materialsCompatible(a, b)).toBe(false);
  });

  test("a base type and a specific material is a fill of the specific one", () => {
    const g = group(
      { source: "spoolio", material: "PLA" },
      { source: "spoolman", material: "PLA-Glow" },
    );
    const [comparison] = compareGroup(g);
    expect(comparison).toMatchObject({ field: "material", kind: "fill" });
    expect(comparison!.options[0]!.value).toBe("PLA-Glow");
    expect(defaultResolution(g).values.material).toBe("PLA-Glow");
    expect(mergedValues(g, { values: {}, createIn: [] }).material).toBe("PLA-Glow");
  });

  test("the plan upgrades the broad record and never replaces the specific one", () => {
    const g = group(
      { source: "spoolio", material: "PLA" },
      { source: "spoolman", material: "PLA-Glow" },
    );
    const plan = buildPlan([g], new Map());
    expect(plan.get("spoolio")?.[0]).toMatchObject({
      changes: [{ field: "material", from: "PLA", to: "PLA-Glow" }],
    });
    expect(plan.get("spoolman")?.some((c) => c.kind === "update" && c.changes.length)).toBeFalsy();
  });

  test("a created record takes the specific material whichever service is first", () => {
    const g = group(
      { source: "spoolman", material: "PLA" },
      { source: "spoolio", material: "HSPLA" },
    );
    expect(mergedValues(g, { values: {}, createIn: [] }).material).toBe("HSPLA");
  });

  test("incompatible materials, and several unrelated specifics, remain conflicts", () => {
    expect(
      compareGroup(
        group({ source: "spoolio", material: "PETG" }, { source: "spoolman", material: "PLA" }),
      )[0],
    ).toMatchObject({ field: "material", kind: "conflict" });
    expect(
      compareGroup(
        group(
          { source: "spoolio", material: "PLA-Silk" },
          { source: "spoolman", material: "PLA-Ultra" },
        ),
      )[0],
    ).toMatchObject({ kind: "conflict" });
  });
});
