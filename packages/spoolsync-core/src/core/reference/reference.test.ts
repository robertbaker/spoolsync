import { describe, expect, test } from "bun:test";

import { matchSpools } from "../match";
import { makeSpool } from "../testing";
import { planSync } from "../../planner";
import {
  AMBIGUOUS_GAP,
  MATCH_MIN,
  ReferenceCatalog,
  nameTokens,
  tokenSimilarity,
} from "./catalog";
import {
  NO_REFERENCE,
  acceptedReferences,
  analyzeReference,
  diffSpool,
  hasColorProblem,
  mergeRecordEdits,
  needsChoice,
  referenceEditsFromAccepted,
  safeReferenceProposals,
} from "./analyze";
import { parseReferenceFile } from "./file";
import { GENERIC_MAPPING, parseMapping, parsePath, readPath, recordsOf } from "./mapping";
import { parseTemperatureRange } from "./normalize";
import { DEFAULT_REFERENCE_POLICY, type ReferenceFilament } from "./types";

const ref = (overrides: Partial<ReferenceFilament> = {}): ReferenceFilament => ({
  id: "r1",
  providerId: "file",
  providerLabel: "Reference file",
  vendor: "Prusament",
  name: null,
  material: "PLA",
  colorName: "Galaxy Black",
  colorHex: "1A1A1A",
  colorHexes: ["1A1A1A"],
  diameter: 1.75,
  density: 1.24,
  nozzleTempMin: 215,
  nozzleTempMax: 230,
  bedTempMin: 40,
  bedTempMax: 60,
  initialWeight: 1000,
  emptySpoolWeight: 201,
  price: null,
  barcode: null,
  url: null,
  attribution: "Test database",
  license: null,
  ...overrides,
});

const withColor = (hex: string, name: string, id = "r1"): Partial<ReferenceFilament> => ({
  id,
  colorName: name,
  colorHex: hex,
  colorHexes: [hex],
});

describe("mapping paths", () => {
  test("parses dotted paths with indexes and rejects odd ones", () => {
    expect(parsePath("a.b[0].c")).toEqual(["a", "b", 0, "c"]);
    expect(parsePath("[0]")).toEqual([0]);
    expect(parsePath("")).toBeNull();
    expect(parsePath("a..b")).toBeNull();
    expect(parsePath("a;b")).toBeNull();
    expect(parsePath("x".repeat(300))).toBeNull();
  });

  test("reads keys exactly, then by normalized name", () => {
    const row = { "Nozzle Temp Min (C)": 210, brand: { Name: "eSUN" } };
    expect(readPath(row, "nozzle_temp_min")).toBe(210);
    expect(readPath(row, "brand.name")).toBe("eSUN");
    expect(readPath(row, "missing.deeper")).toBeUndefined();
    expect(readPath({ list: [{ a: 1 }] }, "list[0].a")).toBe(1);
  });

  test("finds the record list in a document", () => {
    expect(recordsOf([{ a: 1 }], GENERIC_MAPPING)).toEqual([{ a: 1 }]);
    expect(recordsOf({ data: { filaments: [{ a: 1 }] } }, GENERIC_MAPPING)).toEqual([{ a: 1 }]);
    expect(recordsOf({ only: [{ a: 1 }], note: "x" }, GENERIC_MAPPING)).toEqual([{ a: 1 }]);
    expect(recordsOf({ a: [{ x: 1 }], b: [{ y: 1 }] }, GENERIC_MAPPING)).toBeNull();
    expect(recordsOf({ deep: { items: [1] } }, { ...GENERIC_MAPPING, records: "deep.items" })).toEqual([1]);
    expect(recordsOf({ a: [] }, { ...GENERIC_MAPPING, records: "" })).toBeNull();
  });

  test("validates a user mapping and reports every problem", () => {
    const ok = parseMapping({ records: "data.items", fields: { vendor: "maker.name", colorHex: ["hex", "rgb"] } });
    expect(ok.ok && ok.mapping.fields.vendor).toEqual(["maker.name"]);
    expect(ok.ok && ok.mapping.fields.material).toEqual(GENERIC_MAPPING.fields.material);
    const bad = parseMapping({ records: 5, fields: { nope: "x", vendor: [] }, weightUnit: "lb", extra: 1 });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors).toHaveLength(5);
  });
});

describe("reading a reference file", () => {
  const json = JSON.stringify({
    attribution: "Test DB, CC0",
    license: "CC0",
    filaments: [
      {
        brand: "Prusament",
        material: "PLA",
        color_name: "Galaxy Black",
        hex: "#1A1A1A",
        diameter: 1.75,
        net_weight: 1000,
        spool_weight: 201,
        nozzle_temp: "215-230",
        bed_temp: "40 – 60 °C",
        density: 1.24,
        ean: "1234567890123",
        url: "https://example.org/p/1",
      },
    ],
  });

  test("maps JSON through the generic aliases and keeps the credit line", () => {
    const parsed = parseReferenceFile("ref.json", json);
    expect(parsed).toMatchObject({ format: "json", records: 1, skipped: 0, attribution: "Test DB, CC0", license: "CC0" });
    expect(parsed.filaments[0]).toMatchObject({
      vendor: "Prusament",
      material: "PLA",
      colorName: "Galaxy Black",
      colorHex: "1A1A1A",
      diameter: 1.75,
      initialWeight: 1000,
      emptySpoolWeight: 201,
      nozzleTempMin: 215,
      nozzleTempMax: 230,
      bedTempMin: 40,
      bedTempMax: 60,
      density: 1.24,
      barcode: "1234567890123",
      url: "https://example.org/p/1",
      attribution: "Test DB, CC0",
      providerId: "file",
    });
  });

  test("reads CSV, units in headers, kilograms, finishes, and skips rows it cannot use", () => {
    const csv = [
      "Brand,Material,Color Name,Hex,Diameter (mm),Weight (kg)",
      "Polymaker,Silk PLA,Silver,C0C0C0,1.75,1",
      "eSUN,PETG,Black,#000,1.75,1",
      ",PLA,Red,FF0000,1.75,1",
    ].join("\n");
    const parsed = parseReferenceFile("ref.csv", csv);
    expect(parsed.format).toBe("csv");
    expect(parsed.filaments).toHaveLength(2);
    expect(parsed.skipped).toBe(1);
    expect(parsed.warnings.join("\n")).toContain("Record 4: No brand or barcode");
    expect(parsed.filaments[0]).toMatchObject({ material: "PLA", name: "Silk", initialWeight: 1000, colorHex: "C0C0C0" });
    expect(parsed.filaments[1]).toMatchObject({ material: "PETG", colorHex: "000000" });
    expect(parsed.attribution).toBe("Reference file ref.csv");
  });

  test("a color column that holds a word is a name, one that holds hex is a color", () => {
    const parsed = parseReferenceFile(
      "ref.csv",
      ["brand,material,color", "A,PLA,Face", "B,PLA,#FF8800", "C,PLA,FF8800"].join("\n"),
    );
    expect(parsed.filaments.map((f) => [f.colorName, f.colorHex])).toEqual([
      ["Face", null],
      [null, "FF8800"],
      [null, "FF8800"],
    ]);
  });

  test("drops values that are out of range instead of guessing", () => {
    const parsed = parseReferenceFile(
      "ref.json",
      JSON.stringify([
        { brand: "A", material: "PLA", color_name: "Red", diameter: 17.5, nozzle_temp_min: 800, nozzle_temp_max: 230, density: 0 },
      ]),
    );
    expect(parsed.filaments[0]).toMatchObject({ diameter: null, nozzleTempMin: null, nozzleTempMax: 230, density: null });
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(3);
  });

  test("keeps ids unique and stable", () => {
    const row = { brand: "A", material: "PLA", color_name: "Red" };
    const first = parseReferenceFile("a.json", JSON.stringify([row, row]));
    const second = parseReferenceFile("a.json", JSON.stringify([row, row]));
    expect(new Set(first.filaments.map((f) => f.id)).size).toBe(2);
    expect(first.filaments.map((f) => f.id)).toEqual(second.filaments.map((f) => f.id));
    expect(first.filaments[1]!.id).toBe(`${first.filaments[0]!.id}#2`);
  });

  test("explains files it cannot read", () => {
    expect(() => parseReferenceFile("x.json", "{oops")).toThrow("not valid JSON");
    expect(() => parseReferenceFile("x.json", '{"a": 1}')).toThrow("Could not find a list of records");
    expect(() => parseReferenceFile("x.json", "[]")).toThrow("no records");
    expect(() => parseReferenceFile("x.csv", "foo,bar\n1,2")).toThrow("could be read as a filament");
  });

  test("temperature ranges", () => {
    expect(parseTemperatureRange("190-220")).toEqual({ min: 190, max: 220 });
    expect(parseTemperatureRange("220 to 190")).toEqual({ min: 190, max: 220 });
    expect(parseTemperatureRange("410 - 446 °F")).toEqual({ min: 210, max: 230 });
    expect(parseTemperatureRange("210")).toBeNull();
  });
});

describe("name tokens", () => {
  test("ignore case, order, accents, and filler words", () => {
    expect([...nameTokens("Galaxy  Black Filament")].sort()).toEqual(["black", "galaxy"]);
    expect(nameTokens("Grey")).toEqual(nameTokens("Gray"));
    expect(tokenSimilarity(nameTokens("Black Galaxy"), nameTokens("Galaxy Black"))).toBe(1);
    expect(tokenSimilarity(nameTokens("Red"), nameTokens("Blue"))).toBe(0);
    expect(tokenSimilarity(new Set(), nameTokens("Blue"))).toBe(0);
  });
});

describe("catalog matching", () => {
  const catalog = new ReferenceCatalog([
    ref({ id: "r1" }),
    ref({ id: "r2", ...withColor("C0C0C0", "Galaxy Silver", "r2") }),
    ref({ id: "r3", vendor: "Polymaker" }),
  ]);

  test("matches through vendor aliases, case, and material spelling", () => {
    const spool = makeSpool("spoolman", "1", { vendor: "PRUSAMENT inc", material: "pla", name: "galaxy black" });
    const match = catalog.match(spool);
    expect(match.status).toBe("matched");
    expect(match.candidates[0]!.reference.id).toBe("r1");
    expect(match.candidates[0]!.confidence).toBe("high");
    expect(match.candidates[0]!.reasons).toContain("same brand");
    expect(match.candidates[0]!.score).toBeGreaterThanOrEqual(MATCH_MIN);
    // The other Prusament colour is listed but far enough behind not to be a rival.
    expect(match.candidates.map((c) => c.reference.id)).toEqual(["r1", "r2"]);
  });

  test("ordering does not depend on how the catalog was built", () => {
    const shuffled = new ReferenceCatalog([
      ref({ id: "r3", vendor: "Polymaker" }),
      ref({ id: "r2", ...withColor("C0C0C0", "Galaxy Silver", "r2") }),
      ref({ id: "r1" }),
    ]);
    const spool = makeSpool("spoolman", "1");
    expect(shuffled.match(spool)).toEqual(catalog.match(spool));
    expect(shuffled.entries.map((entry) => entry.id)).toEqual(catalog.entries.map((entry) => entry.id));
  });

  test("two equally good records are ambiguous, never auto-selected", () => {
    const twins = new ReferenceCatalog([ref({ id: "a" }), ref({ id: "b", diameter: 2.85, initialWeight: 750 })]);
    const spool = makeSpool("spoolman", "1", { diameter: null, initialWeight: null });
    const match = twins.match(spool);
    expect(match.status).toBe("ambiguous");
    expect(match.candidates.map((c) => c.reference.id)).toEqual(["a", "b"]);
    expect(match.note).toContain("choose");
    // Diameter and size tell them apart once they are known.
    expect(twins.match(makeSpool("spoolman", "1")).status).toBe("matched");
    expect(AMBIGUOUS_GAP).toBeGreaterThan(0);
  });

  test("a weak single candidate is only suggested", () => {
    const sparse = new ReferenceCatalog([ref({ id: "a", colorName: "Galaxy Black Sparkle" })]);
    const spool = makeSpool("spoolman", "1", { material: null, name: "Black", colors: [] });
    expect(sparse.match(spool).status).toBe("suggested");
  });

  test("a different polymer is not a candidate; a different variant is penalized", () => {
    const spool = makeSpool("spoolman", "1", { material: "PETG" });
    expect(catalog.match(spool).status).toBe("none");
    const plus = makeSpool("spoolman", "1", { material: "PLA+" });
    expect(catalog.match(plus).candidates[0]!.reasons.join(" ")).toContain("different variant");
  });

  test("a barcode finds the record without a brand", () => {
    const barcoded = new ReferenceCatalog([ref({ id: "a", barcode: "1234567890123" }), ref({ id: "b", vendor: "Other" })]);
    const spool = makeSpool("spoolman", "1", { vendor: null, upc: "1234-5678-90123" });
    const match = barcoded.match(spool);
    expect(match.status).toBe("matched");
    expect(match.candidates[0]!.reasons).toContain("same barcode");
  });

  test("explains why nothing matched", () => {
    expect(catalog.match(makeSpool("spoolman", "1", { vendor: null })).note).toContain("no brand or barcode");
    expect(catalog.match(makeSpool("spoolman", "1", { vendor: "Nobody" })).note).toBe("No reference filament from this brand.");
  });

  test("custom vendor aliases are honoured", () => {
    const aliased = new ReferenceCatalog([ref()], { vendorAliases: [{ canonical: "Prusament", aliases: ["PRZ"] }] });
    expect(aliased.match(makeSpool("spoolman", "1", { vendor: "PRZ" })).status).toBe("matched");
  });
});

describe("diffs and proposals", () => {
  const catalog = new ReferenceCatalog([ref()]);

  test("fills what is missing and marks what a service cannot take", () => {
    const spool = makeSpool("spoolman", "1", { density: null, emptySpoolWeight: null });
    const analysis = analyzeReference([spool], catalog);
    const item = analysis.items[0]!;
    expect(item.match.status).toBe("matched");
    expect(item.selected?.reference.id).toBe("r1");
    expect(item.chosen).toBe(false);
    expect(analysis.proposals.map((p) => [p.field, p.kind, p.confidence, p.applicable])).toEqual([
      ["density", "fill", "safe", true],
      ["nozzleTempMin", "fill", "safe", false],
      ["nozzleTempMax", "fill", "safe", false],
      ["bedTempMin", "fill", "safe", false],
      ["bedTempMax", "fill", "safe", false],
      ["emptySpoolWeight", "fill", "safe", true],
    ]);
    expect(analysis.proposals[0]).toMatchObject({
      id: "spoolman:1#density",
      before: null,
      after: 1.24,
      providerId: "file",
      referenceId: "r1",
    });
    expect(safeReferenceProposals(analysis.proposals).map((p) => p.field)).toEqual(["density", "emptySpoolWeight"]);
    expect(analysis.summary).toMatchObject({ spools: 1, matched: 1, withMissing: 1, proposals: 6, safe: 6, applicable: 2 });
  });

  test("zero stored for an unknown value counts as missing", () => {
    const spool = makeSpool("spoolman", "1", { density: 0 });
    const diff = diffSpool(spool, ref(), catalog).find((d) => d.field === "density");
    expect(diff).toMatchObject({ status: "missing", spoolValue: 0 });
  });

  test("an existing value is replaced only for fields chosen for overwrite", () => {
    const spool = makeSpool("spoolman", "1", { diameter: 2.85 });
    const keep = analyzeReference([spool], catalog);
    expect(keep.proposals.some((p) => p.field === "diameter")).toBe(false);
    expect(keep.items[0]!.diffs.find((d) => d.field === "diameter")?.status).toBe("differs");
    expect(keep.summary.withDifferences).toBe(1);

    const policy = { ...DEFAULT_REFERENCE_POLICY, overwrite: ["diameter" as const] };
    const overwrite = analyzeReference([spool], catalog, { policy });
    const proposal = overwrite.proposals.find((p) => p.field === "diameter")!;
    expect(proposal).toMatchObject({ kind: "overwrite", confidence: "review", before: 2.85, after: 1.75 });
    expect(safeReferenceProposals(overwrite.proposals)).not.toContain(proposal);
  });

  test("fields outside the policy are not compared", () => {
    const spool = makeSpool("spoolman", "1", { density: null });
    const analysis = analyzeReference([spool], catalog, {
      policy: { fields: ["density"], overwrite: [] },
    });
    expect(analysis.items[0]!.diffs.map((d) => d.field)).toEqual(["density"]);
  });

  test("case, spacing, and word order are not differences", () => {
    const spool = makeSpool("spoolman", "1", { name: "black  GALAXY", vendor: "prusament", material: "pla" });
    const diffs = diffSpool(spool, ref(), catalog, ["name", "vendor", "material"]);
    expect(diffs.map((d) => d.status)).toEqual(["same", "same", "same"]);
  });

  test("flags a color that is far from the reference and a name that does not fit its hex", () => {
    const plain = new ReferenceCatalog([ref(withColor("1A1A1A", "Black"))]);
    const spool = makeSpool("spoolman", "1", { name: "Black", colors: ["FF0000"] });
    const item = analyzeReference([spool], plain).items[0]!;
    expect(item.color?.verdict).toBe("mismatch");
    expect(item.spoolNameHex?.state).toBe("implausible");
    expect(hasColorProblem(item)).toBe(true);
    expect(item.diffs.find((d) => d.field === "colors")?.status).toBe("differs");

    const close = analyzeReference([makeSpool("spoolman", "2", { name: "Galaxy Black", colors: ["202020"] })], catalog).items[0]!;
    expect(["match", "close"]).toContain(close.color?.verdict);
    expect(hasColorProblem(close)).toBe(false);
  });

  test("a reference whose own color does not fit its name is not filled as safe", () => {
    const odd = new ReferenceCatalog([ref(withColor("2244CC", "Red"))]);
    const spool = makeSpool("spoolman", "1", { name: "Red", colors: [] });
    const item = analyzeReference([spool], odd).items[0]!;
    expect(item.referenceNameHex?.state).toBe("implausible");
    const colors = item.proposals.find((p) => p.field === "colors")!;
    expect(colors).toMatchObject({ kind: "fill", confidence: "review" });
    expect(colors.reason).toContain("does not fit its own name");
  });

  test("ambiguous matches wait for a choice and a choice is review-only", () => {
    const twins = new ReferenceCatalog([ref({ id: "a" }), ref({ id: "b", diameter: 2.85 })]);
    const spool = makeSpool("spoolman", "1", { diameter: null, initialWeight: null, density: null });
    const undecided = analyzeReference([spool], twins).items[0]!;
    expect(undecided.selected).toBeNull();
    expect(needsChoice(undecided)).toBe(true);
    expect(undecided.proposals).toEqual([]);

    const picked = analyzeReference([spool], twins, { choices: new Map([["spoolman:1", "b"]]) }).items[0]!;
    expect(picked.selected?.reference.id).toBe("b");
    expect(picked.chosen).toBe(true);
    expect(needsChoice(picked)).toBe(false);
    expect(picked.proposals.length).toBeGreaterThan(0);
    expect(picked.proposals.every((p) => p.confidence === "review" && p.referenceId === "b")).toBe(true);

    const none = analyzeReference([spool], twins, { choices: new Map([["spoolman:1", NO_REFERENCE]]) }).items[0]!;
    expect(none.selected).toBeNull();
    expect(none.proposals).toEqual([]);
    expect(needsChoice(none)).toBe(false);

    // A choice for a record that is no longer a candidate is ignored.
    const stale = analyzeReference([spool], twins, { choices: new Map([["spoolman:1", "gone"]]) }).items[0]!;
    expect(stale.selected).toBeNull();
    expect(needsChoice(stale)).toBe(true);
  });

  test("a person's choice overrides a single clear match", () => {
    const two = new ReferenceCatalog([ref({ id: "a" }), ref({ id: "b", ...withColor("C0C0C0", "Galaxy Silver", "b") })]);
    const spool = makeSpool("spoolman", "1", { density: null });
    const item = analyzeReference([spool], two, { choices: new Map([["spoolman:1", "b"]]) }).items[0]!;
    expect(item.selected?.reference.id).toBe("b");
    expect(item.chosen).toBe(true);
  });

  test("output order is by service and id regardless of input order", () => {
    const a = makeSpool("spoolio", "10");
    const b = makeSpool("spoolman", "2");
    const c = makeSpool("spoolman", "10");
    const keys = analyzeReference([c, a, b], catalog).items.map((item) => item.spoolKey);
    expect(keys).toEqual(["spoolman:2", "spoolman:10", "spoolio:10"]);
  });
});

describe("accepted proposals and the plan", () => {
  const catalog = new ReferenceCatalog([ref()]);
  const spoolman = makeSpool("spoolman", "1", { density: null, emptySpoolWeight: null });
  const spoolio = makeSpool("spoolio", "A", { crossIds: { spoolmanId: 1 }, density: null });

  test("accepted proposals become record edits only where the service can take them", () => {
    const { proposals } = analyzeReference([spoolman], catalog);
    const accepted = acceptedReferences(proposals, new Set(proposals.map((p) => p.id)));
    // Only the fields Spoolman stores survive.
    expect(accepted.map((entry) => entry.field)).toEqual(["density", "emptySpoolWeight"]);
    const { edits, dropped } = referenceEditsFromAccepted(accepted, [spoolman]);
    expect(dropped).toBe(0);
    expect(edits.get("spoolman:1")).toEqual({ density: 1.24, emptySpoolWeight: 201 });
  });

  test("an entry whose spool changed or vanished is dropped", () => {
    const { proposals } = analyzeReference([spoolman], catalog);
    const accepted = acceptedReferences(proposals, new Set(["spoolman:1#density"]));
    const changed = makeSpool("spoolman", "1", { density: 1.3 });
    expect(referenceEditsFromAccepted(accepted, [changed])).toMatchObject({ dropped: 1 });
    expect(referenceEditsFromAccepted(accepted, [])).toMatchObject({ dropped: 1 });
    expect(referenceEditsFromAccepted(accepted, [changed]).edits.size).toBe(0);
  });

  test("the plan writes an accepted fill to the record it names", () => {
    const { proposals } = analyzeReference([spoolman], catalog);
    const accepted = acceptedReferences(proposals, new Set(["spoolman:1#density"]));
    const { edits } = referenceEditsFromAccepted(accepted, [spoolman]);
    const { groups, suggestions } = matchSpools([spoolman, spoolio]);
    const plan = planSync(groups, new Map(), suggestions, new Map(), edits);
    const changes = (plan.get("spoolman") ?? []).flatMap((change) => (change.kind === "update" ? change.changes : []));
    expect(changes).toEqual([{ field: "density", from: null, to: 1.24 }]);
    expect(plan.get("spoolio") ?? []).toEqual([]);
  });

  test("merged edits keep both sets and let the later one win a shared field", () => {
    const cleanup = new Map([["spoolman:1", { vendor: "eSUN", density: 1.1 }]]);
    const reference = new Map([
      ["spoolman:1", { density: 1.24 }],
      ["spoolio:A", { material: "PETG" }],
    ]);
    const merged = mergeRecordEdits(cleanup, undefined, reference);
    expect(merged.get("spoolman:1")).toEqual({ vendor: "eSUN", density: 1.24 });
    expect(merged.get("spoolio:A")).toEqual({ material: "PETG" });
    expect(cleanup.get("spoolman:1")).toEqual({ vendor: "eSUN", density: 1.1 });
  });
});
