import { describe, expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { parseArgs } from "./args";
import { cleanupLines, cleanupSection, runCleanup } from "./cleanup";
import { expandConfig } from "./config";
import { createCliPlan } from "./planning";

const files = ["--spoolman", "spools.json", "--spoolio", "inventory.json"];

describe("cleanup options", () => {
  test("--cleanup and --cleanup-report, with and without rules", () => {
    const plain = parseArgs([...files, "--cleanup"]);
    expect(plain).toMatchObject({ cleanup: true, cleanupReport: false });
    expect(plain.cleanupRules).toBeUndefined();
    expect(parseArgs([...files, "--cleanup=casing,whitespace"]).cleanupRules).toEqual([
      "whitespace",
      "casing",
    ]);
    expect(parseArgs([...files, "--cleanup=all,-casing"]).cleanupRules).not.toContain("casing");
    expect(
      parseArgs([...files, "--cleanup=casing", "--cleanup-report=casing"]),
    ).toMatchObject({ cleanup: true, cleanupReport: true, cleanupRules: ["casing"] });
  });

  test("bad rules, repeats, and conflicting rule lists are refused", () => {
    expect(() => parseArgs([...files, "--cleanup=nope"])).toThrow("Unknown cleanup rule");
    expect(() => parseArgs([...files, "--cleanup", "--cleanup"])).toThrow("only be provided once");
    expect(() => parseArgs([...files, "--cleanup=casing", "--cleanup-report=price"])).toThrow(
      "different rules",
    );
  });

  test("--cleanup needs two inventories; --cleanup-report works with one and plans nothing", () => {
    expect(() => parseArgs(["--spoolman", "spools.json", "--cleanup"])).toThrow(
      "needs at least two",
    );
    expect(parseArgs(["--spoolman", "spools.json", "--cleanup-report"]).cleanupReport).toBe(true);
    expect(() =>
      parseArgs(["--spoolman", "spools.json", "--cleanup-report", "--output-dir", "updated"]),
    ).toThrow("--cleanup-report only reports");
    expect(() => parseArgs([...files, "--cleanup", "--summary"])).toThrow("cannot be combined");
    expect(() => parseArgs([...files, "--cleanup-report", "--reorder"])).toThrow(
      "cannot be combined",
    );
  });

  test("config files accept true, false, or a list of rules", () => {
    const expand = (value: unknown) =>
      expandConfig(["--config", "c.json"], { readText: () => JSON.stringify({ cleanup: value }) });
    expect(expand(true)).toEqual(["--cleanup"]);
    expect(expand(false)).toEqual([]);
    expect(expand("casing")).toEqual(["--cleanup=casing"]);
    expect(() => expand(5)).toThrow('"cleanup" must be true, false');
  });
});

describe("cleanup in the plan", () => {
  const result = (source: SourceId, spools: LoadResult["spools"]): LoadResult => ({
    source,
    spools,
    warnings: [],
    loadedAt: "2026-01-01T00:00:00.000Z",
  });
  const loaded = new Map<SourceId, LoadResult>([
    [
      "spoolman",
      result("spoolman", [makeSpool("spoolman", "1", { vendor: "eSUN", material: "PLA+" })]),
    ],
    [
      "spoolio",
      result("spoolio", [
        makeSpool("spoolio", "A", {
          crossIds: { spoolmanId: 1 },
          vendor: "esun",
          name: " galaxy  black ",
          material: "pla plus",
        }),
        makeSpool("spoolio", "B", { material: "Nylon", name: "Natural" }),
      ]),
    ],
  ]);

  const plannedFields = (
    planning: ReturnType<typeof createCliPlan>,
    source: "spoolio" | "spoolman",
  ) =>
    (planning.plan.get(source) ?? [])
      .flatMap((change) => (change.kind === "update" ? change.changes.map((c) => c.field) : []))
      .sort();

  test("without --cleanup nothing is proposed or planned", () => {
    const planning = createCliPlan(parseArgs([...files]), loaded);
    expect(planning.cleanup).toBeUndefined();
    expect(plannedFields(planning, "spoolio")).toEqual([]);
  });

  test("--cleanup plans safe changes only, and review changes stay proposals", () => {
    const options = parseArgs([...files, "--cleanup"]);
    const planning = createCliPlan(options, loaded);
    expect(plannedFields(planning, "spoolio")).toEqual(["material", "name", "vendor"]);
    expect(plannedFields(planning, "spoolman")).toEqual([]);
    const outcome = planning.cleanup!;
    expect(outcome.applied.map((proposal) => proposal.id).sort()).toEqual([
      "spoolio:A#material",
      "spoolio:A#name",
      "spoolio:A#vendor",
    ]);
    // Nylon to PA needs a person to look at it.
    expect(outcome.result.proposals.find((p) => p.spoolKey === "spoolio:B")).toMatchObject({
      after: "PA",
      confidence: "review",
    });
    const update = (planning.plan.get("spoolio") ?? []).find(
      (change) => change.kind === "update" && change.spool.sourceId === "A",
    );
    expect(update?.kind === "update" && update.changes).toContainEqual({
      field: "vendor",
      from: "esun",
      to: "eSUN",
    });
  });

  test("--cleanup=casing runs only that rule", () => {
    const planning = createCliPlan(parseArgs([...files, "--cleanup=casing"]), loaded);
    expect(planning.cleanup?.result.rules).toEqual(["casing"]);
    expect(plannedFields(planning, "spoolio")).toEqual(["name", "vendor"]);
  });

  test("the JSON section and text lines describe what was applied", () => {
    const options = parseArgs([...files, "--cleanup"]);
    const outcome = createCliPlan(options, loaded).cleanup!;
    const section = cleanupSection(outcome, options);
    expect(section.counts).toEqual({
      proposals: 4,
      safe: 3,
      review: 1,
      applicable: 4,
      warnings: 0,
    });
    expect(section.applied).toHaveLength(3);
    expect(section.proposals).toBeUndefined();
    const text = cleanupLines(outcome, options);
    expect(text.lines[0]).toContain("3 safe changes added to the plan, 1 to review");
    expect(text.lines.join("\n")).toContain(
      'spoolio:A vendor: "esun" -> "eSUN" [safe, casing]',
    );
    expect(text.lines.join("\n")).toContain("--cleanup-report");
    expect(text.warnings).toEqual([]);
  });

  test("--cleanup-report lists every proposal and applies none", () => {
    const options = parseArgs([...files, "--cleanup-report"]);
    const outcome = runCleanup(options, loaded);
    expect(outcome.applied).toEqual([]);
    expect(outcome.edits.size).toBe(0);
    const section = cleanupSection(outcome, options);
    expect(section.proposals).toHaveLength(4);
    expect(section.applied).toEqual([]);
    const text = cleanupLines(outcome, options).lines;
    expect(text[0]).toContain("Nothing is changed");
    expect(text.join("\n")).toContain("spoolio:B material");
  });
});
