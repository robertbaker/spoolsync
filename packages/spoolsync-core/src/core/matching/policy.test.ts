import { expect, test } from "bun:test";

import { matchSpools, pairKey, type MatchingPolicy } from "../match";
import { makeSpool } from "../testing";

const policy: MatchingPolicy = {
  similarity: () => ({ score: 100, reasons: ["Injected score"] }),
  suggestionThreshold: 100,
};

test("injected matching policy changes suggestions without merging records", () => {
  const spools = [makeSpool("spoolman", "1"), makeSpool("spoolio", "one")];
  const result = matchSpools(spools, undefined, policy);
  expect(result.groups).toHaveLength(2);
  expect(result.suggestions).toHaveLength(1);
  expect(result.suggestions[0]!.reasons).toEqual(["Injected score"]);
  expect(
    matchSpools(spools, undefined, { ...policy, suggestionThreshold: 101 }).suggestions,
  ).toEqual([]);
});

test("scoring cannot bypass source uniqueness or rejected member pairs", () => {
  const spools = [
    makeSpool("spoolman", "1"),
    makeSpool("spoolio", "linked", { crossIds: { spoolmanId: 1 } }),
    makeSpool("tigertag", "candidate"),
    makeSpool("spoolio", "other"),
  ];
  const result = matchSpools(
    spools,
    { confirmed: [], rejected: [pairKey("spoolio:linked", "tigertag:candidate")] },
    policy,
  );
  expect(result.groups.find((group) => group.members.spoolman)?.members.spoolio?.sourceId).toBe(
    "linked",
  );
  expect(result.suggestions).toHaveLength(1);
  expect(new Set(result.suggestions[0]!.pair)).toEqual(
    new Set(["spoolio:other", "tigertag:candidate"]),
  );
});

test("identity links remain effective when fuzzy suggestions are disabled", () => {
  const result = matchSpools(
    [makeSpool("spoolman", "1"), makeSpool("spoolio", "linked", { crossIds: { spoolmanId: 1 } })],
    undefined,
    {
      similarity: () => {
        throw new Error("No scoring expected");
      },
      suggestionThreshold: Infinity,
    },
  );
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]!.status).toBe("linked");
  expect(result.suggestions).toEqual([]);
});
