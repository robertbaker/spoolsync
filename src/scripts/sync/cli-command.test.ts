import { describe, expect, test } from "bun:test";

import { deriveCliChoices } from "@spoolsync/core/cli-choices";
import { buildPlan, changeParts, omitExcluded } from "@spoolsync/core/core/compare";
import { matchSpools } from "@spoolsync/core/core/match";
import { makeSpool } from "@spoolsync/core/core/testing";

import { buildCliCommand, shellQuote } from "./cli-command";
import { previewPlan } from "./plan-preview";

function scenario() {
  const spools = [
    makeSpool("spoolman", "1", { remainingWeight: 500 }),
    makeSpool("spoolio", "it's a", { crossIds: { spoolmanId: 1 }, remainingWeight: 600 }),
  ];
  const { groups } = matchSpools(spools, { confirmed: [], rejected: [] });
  const resolutions = new Map([
    [groups[0]!.id, { values: { remainingWeight: 500 }, createIn: [] }],
  ]);
  const plan = buildPlan(groups, resolutions);
  return { groups, resolutions, plan };
}

function command(excluded = new Set<string>(), origin: "api" | "file" = "api") {
  const { groups, resolutions, plan } = scenario();
  const filtered = omitExcluded(plan, excluded);
  const choices = deriveCliChoices(
    groups,
    resolutions,
    { confirmed: [], rejected: [] },
    [],
    filtered,
    ["spoolman", "spoolio"],
  );
  return buildCliCommand({
    loaded: new Map([
      ["spoolman", { origin }],
      ["spoolio", { origin: "file" }],
    ]),
    choices,
    plan: filtered,
    excludedCount: excluded.size,
  });
}

describe("buildCliCommand", () => {
  test("names both Filament DB key variables, primary first", () => {
    const { groups, resolutions, plan } = scenario();
    const choices = deriveCliChoices(
      groups,
      resolutions,
      { confirmed: [], rejected: [] },
      [],
      plan,
      ["spoolman", "spoolio"],
    );
    const { text } = buildCliCommand({
      loaded: new Map([["filamentDbApp", { origin: "api" }]]),
      choices,
      plan,
      excludedCount: 0,
    });
    expect(text).toContain("--filament-db-url '<filamentDbApp-url>'");
    expect(text).toContain("Set FILAMENT_DB_API_KEY (or FILAMENTDB_API_KEY) in your environment");
  });

  test("uses only real options with placeholders and no secrets", () => {
    const { text, caveats } = command();
    expect(caveats).toEqual([]);
    expect(text).toContain("--spoolman-url '<spoolman-url>'");
    expect(text).toContain("--spoolio '<spoolio-export-file>'");
    expect(text).toContain("--resolve remainingWeight=spoolman");
    expect(text).toContain("--output-dir '<output-dir>'");
    expect(text).toContain("SPOOLMAN_TOKEN");
    expect(text).not.toContain("--spoolman-token");
  });

  test("adds --apply only when a directly loaded service has changes", () => {
    expect(command(new Set(), "file").text).not.toContain("--apply");
    const { groups } = scenario();
    const resolutions = new Map([
      [groups[0]!.id, { values: { remainingWeight: 600 }, createIn: [] }],
    ]);
    const plan = buildPlan(groups, resolutions);
    const choices = deriveCliChoices(
      groups,
      resolutions,
      { confirmed: [], rejected: [] },
      [],
      plan,
      ["spoolman", "spoolio"],
    );
    const text = buildCliCommand({
      loaded: new Map([
        ["spoolman", { origin: "api" }],
        ["spoolio", { origin: "file" }],
      ]),
      choices,
      plan,
      excludedCount: 0,
    }).text;
    expect(text).toContain("--apply");
    expect(text).not.toContain("--output-dir");
    expect(text).toContain("--resolve remainingWeight=spoolio");
  });

  test("warns that the CLI cannot skip excluded changes", () => {
    const { plan } = scenario();
    const key = changeParts([...plan.values()].flat()[0]!)[0]!.key;
    const { text, caveats } = command(new Set([key]));
    expect(caveats[0]).toContain("cannot leave out individual changes");
    expect(text.startsWith("# NOTE:")).toBe(true);
  });

  test("quotes awkward values", () => {
    expect(shellQuote("spoolio:it's a")).toBe("'spoolio:it'\\''s a'");
    expect(shellQuote("spoolman:1")).toBe("spoolman:1");
  });
});

describe("previewPlan", () => {
  test("lists each change with its own key and reflects exclusions", () => {
    const { plan } = scenario();
    const changes = plan.get("spoolio")!;
    const key = changeParts(changes[0]!)[0]!.key;
    const spools = previewPlan(changes, new Set([key]));
    expect(spools[0]!.items[0]).toMatchObject({ key, excluded: true });
    expect(spools[0]!.items[0]!.label).toContain("Remaining (g): 600 → 500");
  });
});
