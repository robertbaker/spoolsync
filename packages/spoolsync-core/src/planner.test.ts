import { describe, expect, test } from "bun:test";

import { buildPlan, defaultResolution, mergedValues, type GroupResolution } from "./core/compare";
import {
  matchSpools,
  pairKey,
  recordKey,
  type MatchSuggestion,
  type SpoolGroup,
} from "./core/match";
import { makeSpool } from "./core/testing";
import {
  decideMatch,
  findMatchesCached,
  ensureResolution,
  reconcileResolutions,
  withResolutionBasis,
} from "./planner";

const suggestion: MatchSuggestion = {
  pair: ["spoolman:1", "spoolio:a"],
  groupIds: ["one", "two"],
  score: 80,
  reasons: [],
};
const pair = pairKey(...suggestion.pair);

describe("saved choices against newer data", () => {
  const group = (spoolman: number | null, spoolio: number | null) =>
    matchSpools([
      makeSpool("spoolman", "1", { remainingWeight: spoolman }),
      makeSpool("spoolio", "a", { remainingWeight: spoolio, crossIds: { spoolmanId: 1 } }),
    ]).groups[0]!;
  const reconcile = (next: SpoolGroup, previous: Map<string, GroupResolution>) =>
    reconcileResolutions([next], previous).get(next.id)!;

  test("an automatic fill follows the service instead of restoring the old weight", () => {
    const saved = new Map<string, GroupResolution>();
    const before = group(500, null);
    expect(ensureResolution(saved, before).values.remainingWeight).toBe(500);
    expect(reconcile(group(450, null), saved).values.remainingWeight).toBe(450);
  });

  test("a finished write keeps the choice, and later use reopens the question", () => {
    const saved = new Map<string, GroupResolution>();
    ensureResolution(saved, group(500, null));
    const written = reconcile(group(500, 500), saved);
    expect(written.values.remainingWeight).toBe(500);

    const printed = group(450, 500);
    const next = reconcile(printed, new Map([[printed.id, written]]));
    expect(next.values).not.toHaveProperty("remainingWeight");
    const plan = buildPlan([printed], new Map([[printed.id, next]]));
    const fieldChanges = (plan.get("spoolman") ?? []).flatMap((change) =>
      change.kind === "update" ? change.changes : [],
    );
    expect(fieldChanges).toEqual([]);
  });

  test("a person's pick is dropped when the data under it moves, and kept otherwise", () => {
    const current = group(450, 500);
    const picked = withResolutionBasis(current, {
      values: { remainingWeight: 500 },
      createIn: [],
    });
    const previous = new Map([[current.id, picked]]);
    expect(reconcile(group(450, 500), previous).values.remainingWeight).toBe(500);
    expect(reconcile(group(400, 500), previous).values).not.toHaveProperty("remainingWeight");
  });

  test("a choice saved before this check existed is kept once and checked from then on", () => {
    const current = group(450, 500);
    const legacy = new Map<string, GroupResolution>([
      [current.id, { values: { remainingWeight: 500 }, createIn: [] }],
    ]);
    const stamped = reconcile(current, legacy);
    expect(stamped.values.remainingWeight).toBe(500);
    expect(stamped.seen?.remainingWeight).toEqual({ spoolman: 450, spoolio: 500 });
  });

  test("a new service joining a group does not count as a change", () => {
    const one = matchSpools([makeSpool("spoolman", "1", { comment: "Keep" })]).groups[0]!;
    const previous = new Map([
      [one.id, withResolutionBasis(one, { values: { comment: "Chosen" }, createIn: [] })],
    ]);
    const grown = matchSpools([
      makeSpool("spoolman", "1", { comment: "Keep" }),
      makeSpool("spoolio", "a", { comment: "Other", crossIds: { spoolmanId: 1 } }),
    ]).groups[0]!;
    expect(reconcile(grown, previous).values.comment).toBe("Chosen");
  });
});

test("a created spool takes its range from a service that stores one", () => {
  const spoolman = makeSpool("spoolman", "1", { nozzleTempMin: 205, nozzleTempMax: 205 });
  const spoolstock = makeSpool("spoolstock", "s", { nozzleTempMin: 190, nozzleTempMax: 220 });
  const members = { spoolman, spoolstock };
  const both = { id: "g", members } as unknown as SpoolGroup;
  expect(mergedValues(both, { values: {}, createIn: [] })).toMatchObject({
    nozzleTempMin: 190,
    nozzleTempMax: 220,
  });
  const alone = { id: "g", members: { spoolman } } as unknown as SpoolGroup;
  expect(mergedValues(alone, { values: {}, createIn: [] })).toMatchObject({
    nozzleTempMin: 205,
    nozzleTempMax: 205,
  });
});

test("an accepted cleanup reaches the record and the service being filled", () => {
  const spoolman = makeSpool("spoolman", "1", { vendor: "esun" });
  const spoolio = makeSpool("spoolio", "a", { vendor: null, crossIds: { spoolmanId: 1 } });
  const grouped = matchSpools([spoolman, spoolio]).groups[0]!;
  const edits = new Map([[recordKey(spoolman), { vendor: "eSUN" }]]);
  const plan = buildPlan(
    [grouped],
    new Map([[grouped.id, defaultResolution(grouped)]]),
    new Set(),
    new Map(),
    edits,
  );
  const vendorChange = (source: "spoolman" | "spoolio") => {
    const [change] = plan.get(source) ?? [];
    return change?.kind === "update"
      ? change.changes.find((item) => item.field === "vendor")?.to
      : undefined;
  };
  expect(vendorChange("spoolman")).toBe("eSUN");
  expect(vendorChange("spoolio")).toBe("eSUN");
});

test("a value the person chose over a cleaned one is left as chosen", () => {
  const spoolman = makeSpool("spoolman", "1", { vendor: "esun" });
  const spoolio = makeSpool("spoolio", "a", { vendor: "Other", crossIds: { spoolmanId: 1 } });
  const grouped = matchSpools([spoolman, spoolio]).groups[0]!;
  const plan = buildPlan(
    [grouped],
    new Map([[grouped.id, { values: { vendor: "Other" }, createIn: [] }]]),
    new Set(),
    new Map(),
    new Map([[recordKey(spoolman), { vendor: "eSUN" }]]),
  );
  const [change] = plan.get("spoolman") ?? [];
  expect(change?.kind === "update" && change.changes[0]?.to).toBe("Other");
});

test("a plus sign in a native ID does not inherit choices from a different record", () => {
  const old = matchSpools([makeSpool("spoolio", "a")]).groups[0]!;
  const current = matchSpools([
    makeSpool("spoolman", "1"),
    makeSpool("spoolio", "a+b", { crossIds: { spoolmanId: 1 } }),
  ]).groups[0]!;
  const previous = new Map<string, GroupResolution>([
    [old.id, { values: { comment: "Unrelated choice" }, createIn: [] }],
  ]);
  expect(reconcileResolutions([current], previous).size).toBe(0);
});

test("choices for a native ID containing plus survive when its group grows", () => {
  const spool = makeSpool("spoolio", "a+b", { crossIds: { spoolmanId: 1 } });
  const old = matchSpools([spool]).groups[0]!;
  const current = matchSpools([makeSpool("spoolman", "1"), spool]).groups[0]!;
  const previous = new Map<string, GroupResolution>([
    [old.id, { values: { comment: "Keep this choice" }, createIn: [] }],
  ]);
  expect(reconcileResolutions([current], previous).get(current.id)?.values.comment).toBe(
    "Keep this choice",
  );
});

test("changing a match decision removes its opposite without mutating prior decisions", () => {
  const original = { confirmed: [], rejected: [pair, "unrelated"] };
  const confirmed = decideMatch(original, suggestion, true);
  expect(confirmed).toEqual({ confirmed: [pair], rejected: ["unrelated"] });
  expect(original.rejected).toEqual([pair, "unrelated"]);
  expect(decideMatch(confirmed, suggestion, false)).toEqual({
    confirmed: [],
    rejected: ["unrelated", pair],
  });
  expect(decideMatch(confirmed, suggestion, true)).toBe(confirmed);
});

test("repairs contradictory decisions even if the requested choice already exists", () => {
  expect(decideMatch({ confirmed: [pair], rejected: [pair] }, suggestion, true)).toEqual({
    confirmed: [pair],
    rejected: [],
  });
});

test("reconciled values are independent for unchanged and expanded groups", () => {
  const spool = makeSpool("spoolman", "1");
  const initial = matchSpools([spool]).groups[0]!;
  const resolution: GroupResolution = {
    values: { material: "PLA", colors: ["FFFFFF"] },
    createIn: ["spoolio"],
  };
  const previous = new Map([[initial.id, resolution]]);
  const expanded = matchSpools([spool, makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 } })])
    .groups[0]!;
  for (const group of [initial, expanded]) {
    const next = reconcileResolutions([group], previous).get(group.id)!;
    next.values.material = "PETG";
    (next.values.colors as string[]).push("000000");
    expect(resolution.values).toEqual({ material: "PLA", colors: ["FFFFFF"] });
    expect(next.createIn).toEqual(group === initial ? ["spoolio"] : []);
  }
});

test("merged groups preserve compatible choices from every previous group", () => {
  const first = makeSpool("spoolman", "1");
  const second = makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 } });
  const group = matchSpools([first, second]).groups[0]!;
  const choices: Array<[string, GroupResolution]> = [
    [
      matchSpools([first]).groups[0]!.id,
      {
        values: { material: "PLA", comment: "Keep dry", colors: ["FFFFFF"] },
        createIn: ["tigertag", "spoolio"],
      },
    ],
    [
      matchSpools([second]).groups[0]!.id,
      {
        values: { material: "PETG", location: "Shelf A", colors: ["FFFFFF"] },
        createIn: ["filameter"],
      },
    ],
  ];
  for (const entries of [choices, [...choices].reverse()]) {
    const resolution = reconcileResolutions([group], new Map(entries)).get(group.id)!;
    expect(resolution.values.comment).toBe("Keep dry");
    expect(resolution.values.location).toBe("Shelf A");
    expect(resolution.values.colors).toEqual(["FFFFFF"]);
    expect(resolution.values).not.toHaveProperty("material");
    expect([...resolution.createIn].sort()).toEqual(["filameter", "tigertag"]);
    (resolution.values.colors as string[]).push("000000");
    expect(choices[0]![1].values.colors).toEqual(["FFFFFF"]);
    expect(choices[1]![1].values.colors).toEqual(["FFFFFF"]);
  }
});

describe("findMatchesCached", () => {
  test("the same object twice is a duplicate record, not a cache hit for another inventory", () => {
    const a = makeSpool("spoolman", "1");
    const b = makeSpool("spoolio", "x");
    const decisions = { confirmed: [], rejected: [] };
    expect(findMatchesCached([a, b], decisions).groups).toHaveLength(2);
    expect(() => findMatchesCached([a, a], decisions)).toThrow("Duplicate inventory record");
  });
});
