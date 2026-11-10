import { describe, expect, test } from "bun:test";

import { exportTtag, loadTtag } from ".";
import { buildPlan, type PlannedCreate, type PlannedUpdate } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { aspectId, aspectLabel } from "./reference";

const base = {
  uid: "SYNTH1",
  id_type: 142,
  id_brand: 65535,
  id_material: 65535,
  brand: "Synth",
  material: "PLA",
  name: "Purple",
  color_name: "Purple",
  color_r: 1,
  color_g: 2,
  color_b: 3,
  online_color_list: ["#010203FF"],
  id_aspect1: 255,
  id_aspect2: 255,
  data1: 56,
  data2: 190,
  data3: 230,
  data6: 50,
  data7: 60,
};

const load = (...records: Record<string, unknown>[]) =>
  loadTtag(
    JSON.stringify({ format: "tigertag", kind: "ttag", version: 1, exportedBy: "me", records }),
  );

const exported = (record: Record<string, unknown>, changes: PlannedUpdate["changes"]) => {
  const loaded = load(record);
  const change: PlannedUpdate = {
    kind: "update",
    source: "tigertag",
    groupId: "g",
    spool: loaded.spools[0]!,
    links: {},
    changes,
  };
  const output = exportTtag(loaded, [change]);
  return { output, file: JSON.parse(output.json).records[0] as Record<string, unknown> };
};

const created = (values: Parameters<typeof makeSpool>[2]) => {
  const { groups } = matchSpools([makeSpool("spoolman", "1", values)]);
  const changes = buildPlan(
    groups,
    new Map([[groups[0]!.id, { values: {}, createIn: ["tigertag"] }]]),
  ).get("tigertag")! as PlannedCreate[];
  const output = exportTtag(loadTtag("{}"), changes);
  return { output, record: JSON.parse(output.json).records[0] as Record<string, unknown> };
};

describe("TigerTag finish and aspect mapping", () => {
  const words = [
    "Matte",
    "Silk",
    "Glitter",
    "Metallic",
    "Glow In the Dark",
    "Wood",
    "Marble",
    "Carbon Fiber",
    "Translucent",
    "Transparent",
    "Glossy",
    "Satin",
    "Pearl",
    "Fiber",
    "Neon",
    "Rainbow",
    "Tricolor",
    "Dual Color",
  ];

  test("every common finish word writes an aspect that loads back as the same word", () => {
    for (const word of words) {
      const { record, output } = created({ name: "Plain", finish: word });
      expect(output.warnings).toEqual([]);
      expect(aspectLabel(record["id_aspect1"])).toBe(word);
      expect(loadTtag(output.json).spools[0]!.finish).toBe(word);
    }
  });

  test("TigerTag's own labels are read as the common words", () => {
    expect(aspectId("Metal")).toBe(aspectId("Metallic"));
    expect(aspectLabel(226)).toBe("Metallic");
    expect(aspectLabel(91)).toBe("Glow In the Dark");
    expect(aspectLabel(21)).toBe("Transparent");
    expect(aspectLabel(67)).toBe("Translucent");
    expect(aspectLabel(104)).toBeNull();
  });

  test("a created record never guesses an aspect from the name", () => {
    const { record, output } = created({ name: "Silk Matte Glow Wood" });
    expect(record["id_aspect1"]).toBe(255);
    expect(output.warnings).toEqual([]);
  });

  test("a finish without an aspect warns, and the words that map still fill the slots", () => {
    const { record, output } = created({ name: "Plain", finish: "Multicolor, Silk" });
    expect(record).toMatchObject({ id_aspect1: 92, id_aspect2: 255 });
    expect(output.warnings.join("\n")).toContain("Multicolor has no TigerTag aspect");

    const only = created({ name: "Plain", finish: "Heat Resistant" });
    expect(only.record["id_aspect1"]).toBe(255);
    expect(only.output.warnings.join("\n")).toContain("Heat Resistant has no TigerTag aspect");
  });
});

describe("TigerTag single-value temperatures", () => {
  test("a min write also sets max so no stale range is left", () => {
    const { file } = exported(base, [
      { field: "nozzleTempMin", from: 190, to: 205 },
      { field: "bedTempMin", from: 50, to: 55 },
    ]);
    expect(file).toMatchObject({ data2: 205, data3: 205, data6: 55, data7: 55 });
  });

  test("a created record has equal min and max", () => {
    const { record } = created({
      name: "Plain",
      nozzleTempMin: 200,
      nozzleTempMax: 220,
      bedTempMin: 50,
      bedTempMax: 60,
    });
    expect(record).toMatchObject({ data2: 200, data3: 200, data6: 50, data7: 50 });
  });
});

describe("TigerTag unknown remaining weight", () => {
  const weights = (record: Record<string, unknown>) =>
    exported(record, [{ field: "remainingWeight", from: 100, to: null }]).file["weight_available"];

  test("uses the same weight as loading: measure_gr, then measure by unit, then capacity", () => {
    expect(weights({ ...base, measure_gr: 750 })).toBe(750);
    expect(weights({ ...base, id_unit: 21, measure: 500 })).toBe(500);
    expect(weights({ ...base, id_unit: 35, measure: 2 })).toBe(2000);
    expect(weights({ ...base, capacity: 1000 })).toBe(1000);
    expect(weights({ ...base })).toBe(0);
  });

  test("a weight changed in the same update is used", () => {
    const { file } = exported({ ...base, measure_gr: 750 }, [
      { field: "remainingWeight", from: 100, to: null },
      { field: "initialWeight", from: 750, to: 1000 },
    ]);
    expect(file["weight_available"]).toBe(1000);
  });

  test("a created record with an unknown remaining weight is the full spool", () => {
    const { record, output } = created({
      name: "Plain",
      initialWeight: 1000,
      remainingWeight: null,
    });
    expect(record["weight_available"]).toBe(1000);
    expect(output.warnings.join("\n")).toContain("remaining weight is unknown");
  });
});
