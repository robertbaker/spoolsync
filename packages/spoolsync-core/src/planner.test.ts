import { expect, test } from "bun:test";

import type { GroupResolution } from "./core/compare";
import { matchSpools, pairKey, type MatchSuggestion } from "./core/match";
import { makeSpool } from "./core/testing";
import { decideMatch, reconcileResolutions } from "./planner";

const suggestion: MatchSuggestion = {
  pair: ["spoolman:1", "spoolio:a"],
  groupIds: ["one", "two"],
  score: 80,
  reasons: [],
};
const pair = pairKey(...suggestion.pair);

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
