import { describe, expect, test } from "bun:test";
import path from "node:path";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { parseArgs } from "./args";
import { expandConfig } from "./config";
import { createCliPlan } from "./planning";
import { loadReferenceFile, referenceLines, referenceSection, runReference } from "./reference";

const files = ["--spoolman", "spools.json", "--spoolio", "inventory.json"];

const referenceText = JSON.stringify({
  attribution: "Test reference",
  license: "CC0",
  filaments: [
    {
      brand: "Prusament",
      material: "PLA",
      color_name: "Galaxy Black",
      hex: "#1A1A1A",
      diameter: 1.75,
      net_weight: 1000,
      density: 1.24,
      spool_weight: 201,
    },
    { brand: "Polymaker", material: "PETG", color_name: "Red", hex: "#FF0000" },
  ],
});

const result = (source: SourceId, spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "2026-01-01T00:00:00.000Z",
});

const loaded = new Map<SourceId, LoadResult>([
  ["spoolman", result("spoolman", [makeSpool("spoolman", "1", { density: null, emptySpoolWeight: null })])],
  [
    "spoolio",
    result("spoolio", [
      makeSpool("spoolio", "A", { crossIds: { spoolmanId: 1 }, density: null, emptySpoolWeight: null }),
      makeSpool("spoolio", "B", { vendor: "Nobody", name: "Mystery", crossIds: {} }),
    ]),
  ],
]);

const readText = async (name: string) => {
  if (name === "ref.json") return referenceText;
  const error = new Error("missing") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
};

describe("reference options", () => {
  test("--reference and --reference-report take a file", () => {
    expect(parseArgs([...files, "--reference", "ref.json"])).toMatchObject({ reference: "ref.json" });
    expect(parseArgs([...files, "--reference-report=ref.json"])).toMatchObject({
      referenceReport: "ref.json",
    });
    expect(parseArgs([...files, "--reference", "ref.json", "--reference-report", "ref.json"])).toMatchObject({
      reference: "ref.json",
      referenceReport: "ref.json",
    });
    expect(parseArgs([...files])).not.toHaveProperty("reference");
  });

  test("bad combinations are refused", () => {
    expect(() => parseArgs([...files, "--reference"])).toThrow("--reference requires a value");
    expect(() => parseArgs([...files, "--reference", "a.json", "--reference", "b.json"])).toThrow(
      "only be provided once",
    );
    expect(() => parseArgs([...files, "--reference", "a.json", "--reference-report", "b.json"])).toThrow(
      "different files",
    );
    expect(() => parseArgs(["--spoolman", "spools.json", "--reference", "ref.json"])).toThrow(
      "needs at least two",
    );
    expect(() => parseArgs([...files, "--reference", "ref.json", "--summary"])).toThrow("cannot be combined");
    expect(() => parseArgs([...files, "--reference-report", "ref.json", "--reorder"])).toThrow(
      "cannot be combined",
    );
  });

  test("--reference-report works with one inventory and plans nothing", () => {
    expect(parseArgs(["--spoolman", "spools.json", "--reference-report", "ref.json"]).referenceReport).toBe(
      "ref.json",
    );
    expect(() =>
      parseArgs(["--spoolman", "spools.json", "--reference-report", "ref.json", "--output-dir", "out"]),
    ).toThrow("--reference-report only reports");
  });

  test("config files take paths, relative to the file", () => {
    const expand = (value: unknown) =>
      expandConfig(["--config", path.join("dir", "c.json")], {
        readText: () => JSON.stringify({ reference: value }),
      });
    expect(expand("ref.json")).toEqual([`--reference=${path.join(path.resolve("dir"), "ref.json")}`]);
    expect(() => expand(true)).toThrow('"reference" must be a text value');
  });
});

describe("loading the reference file", () => {
  test("reads and parses it, or explains why not", async () => {
    const options = parseArgs([...files, "--reference", "ref.json"]);
    const read = await loadReferenceFile(options, { readText });
    expect(read?.parsed.filaments).toHaveLength(2);
    expect(read?.parsed.attribution).toBe("Test reference");
    expect(await loadReferenceFile(parseArgs([...files]), { readText })).toBeUndefined();
    await expect(
      loadReferenceFile(parseArgs([...files, "--reference", "gone.json"]), { readText }),
    ).rejects.toThrow('Could not load reference file "gone.json": file not found');
    await expect(
      loadReferenceFile(parseArgs([...files, "--reference", "bad.json"]), { readText: async () => "{oops" }),
    ).rejects.toThrow('Could not load reference file "bad.json": "bad.json" is not valid JSON');
  });
});

describe("reference in the plan", () => {
  const plannedFields = (planning: ReturnType<typeof createCliPlan>, source: "spoolio" | "spoolman") =>
    (planning.plan.get(source) ?? [])
      .flatMap((change) => (change.kind === "update" ? change.changes.map((c) => c.field) : []))
      .sort();

  async function run(...extra: string[]) {
    const options = parseArgs([...files, ...extra]);
    const file = await loadReferenceFile(options, { readText });
    const outcome = file ? runReference(file, loaded, options) : undefined;
    return { options, outcome };
  }

  test("--reference plans safe fills a service can take", async () => {
    const { options, outcome } = await run("--reference", "ref.json");
    const planning = createCliPlan(options, loaded, outcome);
    expect(plannedFields(planning, "spoolman")).toEqual(["density", "emptySpoolWeight"]);
    // Spoolio stores no density, so only the empty spool weight reaches it.
    expect(plannedFields(planning, "spoolio")).toEqual(["emptySpoolWeight"]);
    expect(outcome!.applied.map((p) => p.id).sort()).toEqual([
      "spoolio:A#emptySpoolWeight",
      "spoolman:1#density",
      "spoolman:1#emptySpoolWeight",
    ]);
    expect(planning.reference).toBe(outcome);
  });

  test("without --reference nothing is planned from the file", async () => {
    const options = parseArgs([...files]);
    const planning = createCliPlan(options, loaded);
    expect(planning.reference).toBeUndefined();
    expect(plannedFields(planning, "spoolman")).toEqual([]);
  });

  test("--reference-report analyses everything and applies nothing", async () => {
    const { options, outcome } = await run("--reference-report", "ref.json");
    expect(outcome!.applied).toEqual([]);
    expect(outcome!.edits.size).toBe(0);
    const section = referenceSection(outcome!, options);
    expect(section).toMatchObject({
      provider: "file",
      file: "ref.json",
      attribution: "Test reference",
      license: "CC0",
      catalog: { records: 2, usable: 2, skipped: 0 },
      applied: [],
    });
    expect(section.counts).toMatchObject({ spools: 3, matched: 2, unmatched: 1, ambiguous: 0 });
    expect(section.proposals?.length).toBe(outcome!.analysis.proposals.length);
    expect(section.proposals?.[0]).toMatchObject({ kind: "fill", confidence: "safe", reference: expect.any(String) });
  });

  test("the JSON section without a report lists only what was applied", async () => {
    const { options, outcome } = await run("--reference", "ref.json");
    const section = referenceSection(outcome!, options);
    expect(section.applied).toHaveLength(3);
    expect(section.proposals).toBeUndefined();
    expect(section.ambiguous).toBeUndefined();
    const text = referenceLines(outcome!, options);
    expect(text.lines[0]).toContain("3 safe fills added to the plan");
    expect(text.lines[0]).toContain("license: CC0");
    expect(text.lines.join("\n")).toContain('spoolman:1 density: (empty) -> "1.24" [fill, safe]');
    expect(text.lines.at(-1)).toContain("--reference-report");
  });

  test("an overwrite is reported but never planned", async () => {
    const odd = new Map<SourceId, LoadResult>([
      ["spoolman", result("spoolman", [makeSpool("spoolman", "9", { diameter: 2.85 })])],
    ]);
    const options = parseArgs([...files, "--reference", "ref.json", "--reference-report", "ref.json"]);
    const file = await loadReferenceFile(options, { readText });
    const outcome = runReference(file!, odd, options);
    expect(outcome.applied.every((p) => p.kind === "fill")).toBe(true);
    const overwrite = outcome.analysis.proposals.find((p) => p.field === "diameter");
    expect(overwrite).toMatchObject({ kind: "overwrite", confidence: "review", before: 2.85, after: 1.75 });
    expect(outcome.edits.get("spoolman:9")?.diameter).toBeUndefined();
    const text = referenceLines(outcome, options).lines.join("\n");
    expect(text).toContain("spoolman:9 diameter");
    expect(text).toContain("[overwrite, review]");
  });

  test("color problems and ambiguous choices appear in the report", async () => {
    const mixed = new Map<SourceId, LoadResult>([
      [
        "spoolman",
        result("spoolman", [
          makeSpool("spoolman", "1", { vendor: "Polymaker", material: "PETG", name: "Red", colors: ["0000FF"] }),
        ]),
      ],
    ]);
    const options = parseArgs(["--spoolman", "spools.json", "--reference-report", "ref.json"]);
    const file = await loadReferenceFile(options, { readText });
    const outcome = runReference(file!, mixed, options);
    const section = referenceSection(outcome, options);
    expect(section.colorChecks).toEqual([
      expect.objectContaining({ spool: "spoolman:1", spoolHex: "0000FF", referenceHex: "FF0000", verdict: "mismatch" }),
    ]);
    expect(referenceLines(outcome, options).lines.join("\n")).toContain("color: #0000FF against reference #FF0000");

    const twins = JSON.stringify([
      { brand: "Acme", material: "PLA", color_name: "Red", hex: "FF0000" },
      { brand: "Acme", material: "PLA", color_name: "Red", hex: "FE0000", diameter: 2.85 },
    ]);
    const acme = new Map<SourceId, LoadResult>([
      ["spoolman", result("spoolman", [makeSpool("spoolman", "5", { vendor: "Acme", material: "PLA", name: "Red", colors: [], diameter: null, initialWeight: null })])],
    ]);
    const parsedTwins = await loadReferenceFile(options, { readText: async () => twins });
    const ambiguous = runReference(parsedTwins!, acme, options);
    const section2 = referenceSection(ambiguous, options);
    expect(section2.counts).toMatchObject({ ambiguous: 1, matched: 0, proposals: 0 });
    expect(section2.ambiguous?.[0]).toMatchObject({ spool: "spoolman:5", status: "ambiguous" });
    expect(section2.ambiguous?.[0]?.candidates).toHaveLength(2);
    expect(referenceLines(ambiguous, options).lines.join("\n")).toContain("fits several records");
  });
});
