import { afterEach, describe, expect, test } from "bun:test";

import { proposeCleanup } from "../cleanup";
import {
  buildPlan,
  compareGroup,
  FIELD_LABELS,
  mergedValues,
  SOURCE_FIELDS,
  valuesEqual,
} from "../compare";
import { matchSpools } from "../match";
import { COMPARABLE_FIELDS, SOURCE_IDS, type ComparableField } from "../model";
import { makeSpool } from "../testing";
import { ENABLED_EXTRA_FIELDS } from "./fields";
import { formatValue } from "./values";

const NEW_FIELDS = ["lotNr", "finish", "td"] as const satisfies readonly ComparableField[];

function group(a: Parameters<typeof makeSpool>[2], b: Parameters<typeof makeSpool>[2]) {
  const spoolman = makeSpool("spoolman", "1", {
    crossIds: { spoolmanId: 1, spoolioId: "a" },
    ...a,
  });
  const spoolio = makeSpool("spoolio", "a", {
    crossIds: { spoolmanId: 1, spoolioId: "a" },
    ...b,
  });
  return matchSpools([spoolman, spoolio]).groups[0]!;
}

describe("lot, finish and TD fields", () => {
  const enabled: Array<[(typeof SOURCE_IDS)[number], ComparableField]> = [];
  afterEach(() => {
    for (const [source, field] of enabled.splice(0))
      (SOURCE_FIELDS[source] as Set<ComparableField>).delete(field);
  });

  test("are comparable, labelled, and ordered before notes", () => {
    for (const field of NEW_FIELDS) expect(COMPARABLE_FIELDS).toContain(field);
    expect(FIELD_LABELS.lotNr).toBe("Lot / batch");
    expect(FIELD_LABELS.finish).toBe("Finish");
    expect(FIELD_LABELS.td).toBe("TD (transmission distance)");
    expect(COMPARABLE_FIELDS.indexOf("td")).toBeLessThan(COMPARABLE_FIELDS.indexOf("comment"));
  });

  test("are not stored by any service until an adapter enables them", () => {
    for (const source of SOURCE_IDS)
      for (const field of NEW_FIELDS)
        if (!ENABLED_EXTRA_FIELDS[source]?.includes(field))
          expect(SOURCE_FIELDS[source].has(field)).toBe(false);
    const g = group({ finish: "Matte", td: 1 }, { finish: "Silk", td: 2 });
    expect(compareGroup(g)).toEqual([]);
    const plan = buildPlan(
      [g],
      new Map([[g.id, { values: { finish: "Silk", td: 2 }, createIn: [] }]]),
    );
    expect(plan.size).toBe(0);
  });

  test("compare text case-insensitively and TD numerically", () => {
    expect(valuesEqual("finish", "Matte", " matte ")).toBe(true);
    expect(valuesEqual("finish", "Matte", "Silk")).toBe(false);
    expect(valuesEqual("finish", null, "")).toBe(true);
    expect(valuesEqual("td", 1.2, 1.2)).toBe(true);
    expect(valuesEqual("td", 1.2, 1.3)).toBe(false);
    expect(valuesEqual("td", null, 0)).toBe(false);
    expect(formatValue("td", 1.234)).toBe("1.23");
    expect(formatValue("finish", null)).toBe("—");
  });

  test("an enabled field takes part in comparison, plans and created spools", () => {
    for (const source of ["spoolman", "spoolio"] as const)
      for (const field of NEW_FIELDS) {
        (SOURCE_FIELDS[source] as Set<ComparableField>).add(field);
        enabled.push([source, field]);
      }
    const g = group(
      { finish: "Matte", td: null, lotNr: "L1" },
      { finish: "matte", td: 1.5, lotNr: null },
    );
    expect(compareGroup(g).map((c) => [c.field, c.kind])).toEqual([
      ["lotNr", "fill"],
      ["td", "fill"],
    ]);
    const plan = buildPlan(
      [g],
      new Map([[g.id, { values: { td: 1.5, lotNr: "L1" }, createIn: [] }]]),
    );
    expect(plan.get("spoolman")![0]!.kind === "update" && plan.get("spoolman")![0]).toMatchObject({
      changes: [{ field: "td", from: null, to: 1.5 }],
    });
    expect(plan.get("spoolio")![0]).toMatchObject({
      changes: [{ field: "lotNr", from: null, to: "L1" }],
    });
    const merged = mergedValues(g, { values: {}, createIn: [] });
    expect([merged.lotNr, merged.finish, merged.td]).toEqual(["L1", "Matte", 1.5]);
  });

  test("cleanup trims whitespace in lot and finish", () => {
    const spool = makeSpool("spoolman", "1", {
      lotNr: " L-1  ",
      finish: "Matte ",
    });
    const { proposals } = proposeCleanup([spool]);
    expect(proposals.map((p) => [p.field, p.after, p.applicable])).toEqual([
      ["lotNr", "L-1", false],
      ["finish", "Matte", false],
    ]);
  });
});

describe("records whose origin cannot carry a field", () => {
  test("do not take part in comparison for that field", () => {
    const ids = { spoolmanId: 1, filamentDbAppId: "a" };
    const full = makeSpool("spoolman", "1", { crossIds: ids, diameter: 1.75 });
    const csv = makeSpool("filamentDbApp", "a", {
      crossIds: ids,
      diameter: null,
      unavailable: ["diameter"],
    });
    const marked = matchSpools([full, csv]).groups[0]!;
    expect(compareGroup(marked).some((c) => c.field === "diameter")).toBe(false);
    const plain = matchSpools([full, { ...csv, unavailable: undefined }]).groups[0]!;
    expect(compareGroup(plain).some((c) => c.field === "diameter")).toBe(true);
  });
});
