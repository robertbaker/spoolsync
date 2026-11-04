import { describe, expect, test } from "bun:test";

import type { CommonSpool } from "../model";
import { makeSpool } from "../testing";
import {
  acceptedFrom,
  expandBundles,
  parseRuleSelection,
  proposeCleanup,
  recordEditsFromAccepted,
  safeProposalIds,
  summarizeCleanup,
  toRecordEdits,
} from "./engine";
import { parseMaterial } from "./materials";
import { sanitizeAcceptedCleanups, sanitizeCleanupSettings } from "./settings";
import { recase } from "./text";
import { CLEANUP_RULE_IDS } from "./types";
import { buildVendorIndex, canonicalVendor, vendorKey } from "./vendors";

/** A spool whose text fields are loosely typed, the way a damaged source can deliver them. */
const loose = (overrides: Record<string, unknown>): CommonSpool =>
  makeSpool("spoolio", "1", {
    vendor: null,
    material: null,
    name: null,
    colors: [],
    diameter: null,
    density: null,
    initialWeight: null,
    remainingWeight: null,
    ...overrides,
  } as Partial<CommonSpool>);

const propose = (overrides: Record<string, unknown>, options = {}) =>
  proposeCleanup([loose(overrides)], options);

const only = (overrides: Record<string, unknown>, field: string) =>
  propose(overrides).proposals.find((proposal) => proposal.field === field);

describe("whitespace", () => {
  test("trims, collapses, and removes non-breaking and zero-width characters", () => {
    const proposal = only({ name: "  Galaxy  Black​  " }, "name");
    expect(proposal).toMatchObject({
      before: "  Galaxy  Black​  ",
      after: "Galaxy Black",
      rule: "whitespace",
      confidence: "safe",
      id: "spoolio:1#name",
      spoolKey: "spoolio:1",
    });
  });

  test("keeps line breaks and inner spacing in notes", () => {
    const proposal = only({ comment: " dry me \n  twice \n" }, "comment");
    expect(proposal?.after).toBe("dry me \n  twice");
  });

  test("whitespace-only text becomes null for review; an empty string is left alone", () => {
    expect(only({ location: "   " }, "location")).toMatchObject({
      after: null,
      confidence: "review",
    });
    expect(only({ location: "" }, "location")).toBeUndefined();
    expect(only({ location: null }, "location")).toBeUndefined();
  });
});

describe("casing", () => {
  test("title-cases all-lowercase and all-uppercase text with brand and material exceptions", () => {
    expect(only({ vendor: "esun" }, "vendor")?.after).toBe("eSUN");
    expect(only({ vendor: "POLYMAKER" }, "vendor")?.after).toBe("Polymaker");
    expect(only({ name: "galaxy black" }, "name")?.after).toBe("Galaxy Black");
    expect(only({ name: "PLA+ SILK GOLD" }, "name")?.after).toBe("PLA+ Silk Gold");
    expect(only({ name: "petg-cf carbon" }, "name")?.after).toBe("PETG-CF Carbon");
    expect(only({ name: "shore 95a blue" }, "name")?.after).toBe("Shore 95A Blue");
    expect(only({ name: "king of the hill" }, "name")?.after).toBe("King of the Hill");
  });

  test("leaves mixed-case text to the alias table", () => {
    expect(only({ vendor: "PolyMaker" }, "vendor")?.after).toBe("Polymaker");
    expect(only({ vendor: "ColorFabb" }, "vendor")?.after).toBe("colorFabb");
    expect(only({ name: "Galaxy Black" }, "name")).toBeUndefined();
    expect(recase("Galaxy Black")).toBeNull();
    expect(recase("x")).toBeNull();
  });

  test("keeps unknown short capitals in all-caps text and asks for review", () => {
    const proposal = only({ name: "FDS BLUE" }, "name");
    expect(proposal).toMatchObject({ after: "FDS Blue", confidence: "review" });
  });
});

describe("vendor aliases", () => {
  test("maps spellings to one canonical name and runs after whitespace and casing", () => {
    const proposal = only({ vendor: "  PRUSAMENT inc " }, "vendor");
    expect(proposal).toMatchObject({
      after: "Prusament",
      rule: "vendor-alias",
      rules: ["whitespace", "vendor-alias"],
      confidence: "review",
    });
    expect(only({ vendor: "Prusament Inc." }, "vendor")?.after).toBe("Prusament");
    expect(only({ vendor: "Bambulab" }, "vendor")?.after).toBe("Bambu Lab");
    expect(only({ vendor: "Shenzhen eSUN Co., Ltd" }, "vendor")?.after).toBe("eSUN");
  });

  test("a spelling that differs only in punctuation is safe", () => {
    expect(only({ vendor: "E-Sun" }, "vendor")).toMatchObject({
      after: "eSUN",
      confidence: "safe",
    });
  });

  test("custom aliases extend and override the built-in table", () => {
    const options = {
      vendorAliases: [
        { canonical: "My Mill", aliases: ["mm filament", "the mill"] },
        { canonical: "Esun Filaments", aliases: ["esun"] },
      ],
    };
    expect(
      propose({ vendor: "The Mill" }, options).proposals.find((p) => p.field === "vendor")?.after,
    ).toBe("My Mill");
    expect(
      propose({ vendor: "eSUN" }, options).proposals.find((p) => p.field === "vendor")?.after,
    ).toBe("Esun Filaments");
    const index = buildVendorIndex();
    expect(canonicalVendor("unknown brand", index)).toBeNull();
    expect(vendorKey("Müller GmbH")).toBe("muller");
  });
});

describe("material", () => {
  test.each([
    ["pla plus", "PLA+", "safe"],
    ["PLA+", null, null],
    ["Pla+", "PLA+", "safe"],
    ["petg", "PETG", "safe"],
    ["pet-g", "PETG", "safe"],
    ["abs-gf", "ABS-GF", "safe"],
    ["PETG Carbon Fiber", "PETG-CF", "review"],
    ["tpu 95a", "TPU 95A", "safe"],
    ["Nylon", "PA", "review"],
    ["nylon 12", "PA12", "review"],
    ["pa12", "PA12", "safe"],
    ["PA", null, null],
    ["PC-ABS", null, null],
    ["Special Blend", null, null],
  ] as const)("%s", (input, expected, confidence) => {
    const proposal = only({ material: input }, "material");
    if (expected === null) expect(proposal).toBeUndefined();
    else expect(proposal).toMatchObject({ after: expected, confidence });
  });

  test("parseMaterial understands the parts", () => {
    expect(parseMaterial("Silk PLA+")).toMatchObject({
      base: "PLA",
      plus: true,
      variants: ["Silk"],
    });
    expect(parseMaterial("PA6 CF")).toMatchObject({ base: "PA6", fiber: "CF" });
    expect(parseMaterial("")).toBeNull();
  });
});

describe("material variants", () => {
  test("moves a finish to the name as one bundle", () => {
    const result = propose({ material: "Silk PLA", name: "Gold" });
    const material = result.proposals.find((p) => p.field === "material");
    const name = result.proposals.find((p) => p.field === "name");
    expect(material).toMatchObject({
      after: "PLA",
      rule: "material-variant",
      confidence: "review",
    });
    expect(name).toMatchObject({ after: "Silk Gold", rule: "material-variant" });
    expect(material?.bundle).toBeDefined();
    expect(material?.bundle).toBe(name?.bundle);
    expect(expandBundles(result.proposals, [material!.id])).toEqual(
      new Set([material!.id, name!.id]),
    );
  });

  test("a finish already in the name only leaves the material", () => {
    const result = propose({ material: "PLA Matte", name: "Matte Black" });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ field: "material", after: "PLA" });
    expect(result.proposals[0]?.bundle).toBeUndefined();
  });

  test("without a name the finish stays in the material, spelled canonically", () => {
    const result = propose({ material: "silk pla", name: null });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ after: "PLA Silk" });
  });

  test("turning the rule off keeps the finish in the material", () => {
    const enabled = CLEANUP_RULE_IDS.filter((id) => id !== "material-variant");
    const result = propose({ material: "Silk PLA", name: "Gold" }, { enabled });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ field: "material", after: "PLA Silk" });
  });
});

describe("diameter", () => {
  test.each([
    ["1,75", 1.75, "safe"],
    ["1.75mm", 1.75, "safe"],
    [175, 1.75, "review"],
    [2850, 2.85, "review"],
    [1.72, 1.75, "review"],
    [1.7500001, 1.75, "safe"],
  ] as const)("%p", (input, expected, confidence) => {
    expect(only({ diameter: input }, "diameter")).toMatchObject({ after: expected, confidence });
  });

  test("a standard size is untouched and an odd one is flagged, not changed", () => {
    expect(propose({ diameter: 1.75 }).proposals).toEqual([]);
    const odd = propose({ diameter: 2.2 });
    expect(odd.proposals).toEqual([]);
    expect(odd.warnings.map((w) => w.field)).toEqual(["diameter"]);
    expect(propose({ diameter: "wide" }).warnings[0]?.message).toContain("not a number");
    expect(propose({ diameter: -1.75 }).warnings[0]?.message).toContain("not possible");
  });
});

describe("colors", () => {
  test("normalizes, expands and removes repeats", () => {
    expect(only({ colors: ["#ff0000", "F00", "ff0000", "00ff00"] }, "colors")).toMatchObject({
      after: ["FF0000", "00FF00"],
      confidence: "safe",
    });
    expect(only({ colors: ["FF0000"] }, "colors")).toBeUndefined();
  });

  test("dropping a non-opaque alpha channel needs review; opaque alpha does not", () => {
    expect(only({ colors: ["#ff000080"] }, "colors")).toMatchObject({
      after: ["FF0000"],
      confidence: "review",
    });
    expect(only({ colors: ["#ff0000ff"] }, "colors")).toMatchObject({ confidence: "safe" });
  });

  test("an unreadable color is kept and flagged", () => {
    const result = propose({ colors: ["red", "#00f"] });
    expect(result.proposals[0]?.after).toEqual(["red", "0000FF"]);
    expect(result.warnings[0]?.message).toContain("not a hex code");
  });
});

describe("price", () => {
  test.each([
    ["$24,99", 24.99],
    ["24.99 USD", 24.99],
    ["€ 1.299,00", 1299],
  ] as const)("%s", (input, expected) => {
    expect(only({ price: input }, "price")).toMatchObject({ after: expected, rule: "price" });
  });

  test("flags implausible prices without changing them", () => {
    expect(propose({ price: -3 }).warnings[0]?.message).toContain("negative");
    expect(propose({ price: 0 }).warnings[0]?.message).toContain("0");
    expect(propose({ price: 12000 }).warnings[0]?.message).toContain("unusually high");
    expect(propose({ price: -3 }).proposals).toEqual([]);
    expect(propose({ price: "free" }).warnings[0]?.message).toContain("not a number");
  });

  test("an ambiguous separator needs review and floating noise is safe", () => {
    expect(only({ price: "1,299" }, "price")).toMatchObject({ after: 1299, confidence: "review" });
    expect(only({ price: 24.990000001 }, "price")).toMatchObject({
      after: 24.99,
      confidence: "safe",
    });
  });
});

describe("weight", () => {
  test("units are converted for review; a plain gram text is safe", () => {
    expect(only({ initialWeight: "1kg" }, "initialWeight")).toMatchObject({
      after: 1000,
      confidence: "review",
    });
    expect(only({ initialWeight: "250 g" }, "initialWeight")).toMatchObject({
      after: 250,
      confidence: "safe",
    });
  });

  test("sanity problems are warnings, never changes", () => {
    const result = propose({ initialWeight: 1, remainingWeight: 1200, emptySpoolWeight: -5 });
    expect(result.proposals).toEqual([]);
    const messages = result.warnings.map((w) => w.message).join("|");
    expect(messages).toContain("looks like kilograms");
    expect(messages).toContain("more than the full weight");
    expect(messages).toContain("negative");
    expect(propose({ initialWeight: 1000, remainingWeight: 1200 }).warnings).toHaveLength(1);
    expect(propose({ initialWeight: 1000, remainingWeight: 640 }).warnings).toEqual([]);
  });
});

describe("temperature", () => {
  test("parses text and swaps a reversed range as a reviewed bundle", () => {
    expect(only({ nozzleTempMin: "210°C" }, "nozzleTempMin")).toMatchObject({
      after: 210,
      confidence: "safe",
    });
    const result = propose({ nozzleTempMin: 250, nozzleTempMax: 210 });
    const [min, max] = ["nozzleTempMin", "nozzleTempMax"].map((field) =>
      result.proposals.find((proposal) => proposal.field === field),
    );
    expect(min).toMatchObject({ before: 250, after: 210, confidence: "review" });
    expect(max).toMatchObject({ before: 210, after: 250, confidence: "review" });
    expect(min?.bundle).toBe(max?.bundle);
  });

  test("implausible temperatures are flagged", () => {
    expect(propose({ nozzleTempMax: 900 }).warnings).toHaveLength(1);
    expect(propose({ bedTempMin: -20 }).warnings).toHaveLength(1);
    expect(propose({ nozzleTempMin: 190, nozzleTempMax: 220, bedTempMin: 60 }).warnings).toEqual(
      [],
    );
  });
});

describe("barcode and date", () => {
  test("barcodes lose spaces; spreadsheet damage is flagged", () => {
    const proposal = only({ upc: " 4 006381 333931" }, "upc");
    expect(proposal).toMatchObject({ after: "4006381333931", rules: ["whitespace", "barcode"] });
    expect(propose({ upc: "4.00638E+12" }).warnings[0]?.message).toContain("scientific");
  });

  test("dates", () => {
    expect(only({ purchasedOn: "2024/3/5" }, "purchasedOn")).toMatchObject({
      after: "2024-03-05",
      confidence: "safe",
    });
    expect(only({ purchasedOn: "25.03.2024" }, "purchasedOn")).toMatchObject({
      after: "2024-03-25",
      confidence: "review",
    });
    expect(propose({ purchasedOn: "03/04/2024" }).warnings).toHaveLength(1);
    expect(
      propose({ purchasedOn: "2030-01-01" }, { today: "2026-01-01" }).warnings[0]?.message,
    ).toContain("future");
    expect(propose({ purchasedOn: "2030-01-01" }).warnings).toEqual([]);
  });
});

describe("engine", () => {
  test("rules are individually toggleable", () => {
    const spool = loose({ vendor: " esun ", name: "galaxy black" });
    const all = proposeCleanup([spool]);
    expect(all.rules).toEqual([...CLEANUP_RULE_IDS]);
    const withoutCasing = proposeCleanup([spool], {
      enabled: CLEANUP_RULE_IDS.filter((id) => id !== "casing"),
    });
    expect(withoutCasing.proposals.map((p) => [p.field, p.after])).toEqual([["vendor", "eSUN"]]);
    expect(proposeCleanup([spool], { enabled: [] }).proposals).toEqual([]);
    expect(proposeCleanup([spool], { enabled: ["whitespace"] }).proposals[0]?.after).toBe("esun");
  });

  test("does not modify its input and is deterministic regardless of input order", () => {
    const a = loose({ vendor: "esun" });
    const b = makeSpool("spoolman", "2", { vendor: "ELEGOO", name: "red" });
    const c = makeSpool("spoolman", "10", { vendor: "sunlu" });
    const before = structuredClone([a, b, c]);
    const first = proposeCleanup([a, b, c]);
    const second = proposeCleanup([c, a, b]);
    expect(second).toEqual(first);
    expect([a, b, c]).toEqual(before);
    expect(first.proposals.map((p) => p.spoolKey)).toEqual([
      "spoolman:2",
      "spoolman:2",
      "spoolman:10",
      "spoolio:1",
    ]);
  });

  test("clean data produces nothing and spools without fields do not crash", () => {
    const clean = makeSpool("spoolman", "1");
    expect(proposeCleanup([clean])).toMatchObject({ proposals: [], warnings: [] });
    expect(proposeCleanup([])).toMatchObject({ proposals: [], spoolsChecked: 0 });
  });

  test("marks whether the service can take the change", () => {
    const readOnly = makeSpool("spoolstock", "S1", { vendor: "esun" });
    const writable = makeSpool("spoolman", "1", { vendor: "esun" });
    // Spoolio stores no barcode, so a cleaned barcode there cannot be written.
    const noField = makeSpool("spoolio", "1", { upc: " 4 006381 333931" });
    const result = proposeCleanup([readOnly, writable, noField]);
    const applicable = Object.fromEntries(result.proposals.map((p) => [p.id, p.applicable]));
    expect(applicable).toEqual({
      "spoolstock:S1#vendor": false,
      "spoolman:1#vendor": true,
      "spoolio:1#upc": false,
    });
    expect(safeProposalIds(result.proposals)).toEqual(new Set(["spoolman:1#vendor"]));
  });

  test("a bundle takes the most cautious confidence and needs two members", () => {
    const result = proposeCleanup([
      makeSpool("spoolman", "1", { material: "Silk PLA", name: "gold" }),
    ]);
    const material = result.proposals.find((p) => p.field === "material");
    const name = result.proposals.find((p) => p.field === "name");
    expect(material?.confidence).toBe("review");
    expect(name?.confidence).toBe("review");
    expect(name?.after).toBe("Silk Gold");
  });

  test("summary counts by confidence and rule", () => {
    const result = proposeCleanup([
      makeSpool("spoolman", "1", { vendor: "esun", name: "galaxy black", price: -1 }),
    ]);
    expect(summarizeCleanup(result)).toEqual({
      total: 2,
      safe: 2,
      review: 0,
      applicable: 2,
      spools: 1,
      byRule: { casing: 2 },
      warnings: 1,
    });
  });
});

describe("accepted cleanups", () => {
  test("round-trip into record edits, dropping stale ones", () => {
    const spool = makeSpool("spoolman", "1", { vendor: "esun", name: "red" });
    const result = proposeCleanup([spool]);
    const accepted = acceptedFrom(result.proposals, new Set(result.proposals.map((p) => p.id)));
    expect(accepted).toHaveLength(2);
    const fresh = recordEditsFromAccepted(accepted, [spool]);
    expect(fresh.dropped).toBe(0);
    expect(fresh.edits.get("spoolman:1")).toEqual({ vendor: "eSUN", name: "Red" });
    const changed = recordEditsFromAccepted(accepted, [{ ...spool, name: "Blue" }]);
    expect(changed.dropped).toBe(1);
    expect(changed.edits.get("spoolman:1")).toEqual({ vendor: "eSUN" });
    expect(recordEditsFromAccepted(accepted, []).dropped).toBe(2);
    expect(toRecordEdits([]).size).toBe(0);
  });

  test("only applicable proposals are accepted", () => {
    const result = proposeCleanup([makeSpool("spoolstock", "S1", { vendor: "esun" })]);
    expect(acceptedFrom(result.proposals, new Set([result.proposals[0]!.id]))).toEqual([]);
  });
});

describe("rule selection and stored shapes", () => {
  test("parseRuleSelection", () => {
    expect(parseRuleSelection("casing,whitespace")).toEqual({
      ok: true,
      enabled: ["whitespace", "casing"],
    });
    expect(parseRuleSelection("all")).toEqual({ ok: true, enabled: [...CLEANUP_RULE_IDS] });
    const except = parseRuleSelection("all,-casing");
    expect(except.ok && except.enabled).toEqual(CLEANUP_RULE_IDS.filter((id) => id !== "casing"));
    expect(parseRuleSelection("-casing")).toEqual(except);
    expect(parseRuleSelection("nope")).toMatchObject({ ok: false });
    expect(parseRuleSelection("")).toMatchObject({ ok: false });
    expect(parseRuleSelection("casing,-casing")).toMatchObject({ ok: false });
  });

  test("settings and accepted entries are validated", () => {
    expect(sanitizeCleanupSettings(null).enabled).toEqual([...CLEANUP_RULE_IDS]);
    expect(sanitizeCleanupSettings({ enabled: ["casing", "bogus", 4] }).enabled).toEqual([
      "casing",
    ]);
    expect(sanitizeCleanupSettings({ enabled: [] }).enabled).toEqual([]);
    expect(sanitizeCleanupSettings({ enabled: "casing" }).enabled).toEqual([...CLEANUP_RULE_IDS]);
    const good = { spoolKey: "spoolman:1", field: "vendor" as const, before: "a", after: "b" };
    expect(
      sanitizeAcceptedCleanups([
        good,
        good,
        { ...good, field: "nope" },
        { ...good, spoolKey: "" },
        { ...good, field: "name", after: { x: 1 } },
        "text",
        null,
      ]),
    ).toEqual([good]);
    expect(sanitizeAcceptedCleanups("nope")).toEqual([]);
  });
});
