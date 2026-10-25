import { describe, expect, test } from "bun:test";

import { groupKey, matchSpools, pairKey, similarity } from "./match";
import { makeSpool } from "./testing";

describe("matchSpools", () => {
  test("equal-score suggestions are stable without reordering caller inventories", () => {
    const native = makeSpool("spoolman", "1");
    const first = makeSpool("spoolstock", "a");
    const second = makeSpool("spoolstock", "b");
    for (const input of [
      [native, first, second],
      [second, native, first],
      [first, second, native],
      [native, second, first],
    ]) {
      const before = [...input];
      expect(matchSpools(input).suggestions.map((suggestion) => suggestion.pair)).toEqual([
        ["spoolman:1", "spoolstock:a"],
      ]);
      expect(input).toEqual(before);
    }
  });
  test("conflicting cross-ID links stay the same for every inventory input order", () => {
    const spools = [
      makeSpool("spoolman", "51", { crossIds: { spoolmanId: 51, spoolstockShortId: "s1" } }),
      makeSpool("spoolio", "p1", { crossIds: { spoolmanId: 51 } }),
      makeSpool("spoolio", "p2", { crossIds: { spoolstockShortId: "s1" } }),
      makeSpool("spoolstock", "s1"),
    ];
    const permutations = <T>(items: T[]): T[][] =>
      items.length === 0
        ? [[]]
        : items.flatMap((item, index) =>
            permutations(items.filter((_, candidate) => candidate !== index)).map((rest) => [
              item,
              ...rest,
            ]),
          );
    for (const input of permutations(spools)) {
      const result = matchSpools(input);
      expect(result.groups.map((group) => group.id).sort()).toEqual([
        "spoolio:p1+spoolman:51",
        "spoolio:p2",
        "spoolstock:s1",
      ]);
      expect(result.problems).toHaveLength(1);
    }
  });
  test("plus materials stay distinct from their base material in fuzzy suggestions", () => {
    const base = makeSpool("spoolman", "1", { material: "PLA" });
    const plus = makeSpool("spoolio", "a", { material: "PLA+" });
    expect(similarity(base, plus).reasons).toContain("different material");
    expect(matchSpools([base, plus]).suggestions).toEqual([]);
    const spelledOut = makeSpool("spoolman", "2", { material: "PLA Plus" });
    expect(similarity(spelledOut, plus).reasons).toContain("same material");
    expect(matchSpools([spelledOut, plus]).suggestions).toHaveLength(1);
  });
  test("native IDs containing group separators cannot collide with linked group IDs", () => {
    const result = matchSpools([
      makeSpool("spoolman", "1"),
      makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 } }),
      makeSpool("spoolio", "a+spoolman:1"),
    ]);
    expect(result.groups).toHaveLength(2);
    expect(new Set(result.groups.map((group) => group.id)).size).toBe(2);
    expect(result.groups.map((group) => group.id)).toContain("spoolio:a%2Bspoolman:1");
    expect(groupKey(["spoolio:a+b"])).not.toBe(groupKey(["spoolio:a%2Bb"]));
    expect(groupKey(["spoolman:1", "spoolio:a"])).toBe("spoolio:a+spoolman:1");
  });
  test("rejects duplicate native record keys before they can collapse", () => {
    expect(() => matchSpools([makeSpool("spoolio", "a"), makeSpool("spoolio", "a")])).toThrow(
      "Duplicate inventory record: spoolio:a",
    );
    expect(
      matchSpools([makeSpool("spoolio", "1"), makeSpool("spoolman", "1")]).groups,
    ).toHaveLength(2);
  });

  test("reports incompatible confirmations instead of silently ignoring them", () => {
    const result = matchSpools(
      [makeSpool("spoolman", "1"), makeSpool("spoolio", "a"), makeSpool("spoolio", "b")],
      {
        confirmed: [pairKey("spoolman:1", "spoolio:a"), pairKey("spoolman:1", "spoolio:b")],
        rejected: [],
      },
    );
    expect(result.groups).toHaveLength(2);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("Could not confirm");
    expect(result.problems[0]).toContain("same source");
  });
  test("links records through stamped cross-ids", () => {
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51, spoolstockShortId: "410e5312" },
    });
    const spoolstock = makeSpool("spoolstock", "410e5312", { vendor: "Someone else" });
    const { groups, problems } = matchSpools([spoolman, spoolstock]);
    expect(problems).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ status: "linked", members: { spoolman, spoolstock } });
  });

  test("never puts two records from one service in a group", () => {
    const a = makeSpool("spoolman", "1", { crossIds: { spoolmanId: 1, spoolstockShortId: "x" } });
    const b = makeSpool("spoolman", "2", { crossIds: { spoolmanId: 2, spoolstockShortId: "x" } });
    const { groups, problems } = matchSpools([a, b]);
    expect(groups).toHaveLength(2);
    expect(problems[0]).toContain("Spoolstock ID x");
    expect(problems[0]).toContain("skipped for linking");
  });

  test("a suggestion next to an id-linked group leaves that group usable", () => {
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51, spoolstockShortId: "s1" },
    });
    const spoolstock = makeSpool("spoolstock", "s1");
    const tigertag = makeSpool("tigertag", "T1", { crossIds: { tigertagUid: "T1" } });
    const { groups, suggestions } = matchSpools([spoolman, spoolstock, tigertag]);
    expect(groups.find((g) => g.members.spoolman)?.status).toBe("linked");
    expect(suggestions[0]?.groupIds).toContain("spoolman:51+spoolstock:s1");
  });

  test("does not partly link a conflicting id", () => {
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51, spoolstockShortId: "s1" },
    });
    const spoolio = makeSpool("spoolio", "p1", { crossIds: { spoolioId: "p1", spoolmanId: 51 } });
    const otherSpoolio = makeSpool("spoolio", "p2", {
      crossIds: { spoolioId: "p2", spoolstockShortId: "s1" },
      vendor: "Elegoo",
      colors: ["FF0000"],
    });
    const spoolstock = makeSpool("spoolstock", "s1", { vendor: "Elegoo", colors: ["FF0000"] });
    const { groups, problems } = matchSpools([spoolman, spoolio, otherSpoolio, spoolstock]);
    expect(problems).toHaveLength(1);
    // spoolman:51 links Spoolman and the first Spoolio record; the contested Spoolstock id links nothing.
    const linked = groups.find((g) => g.members.spoolman)!;
    expect(Object.keys(linked.members).sort()).toEqual(["spoolio", "spoolman"]);
  });

  test("suggests look-alike spools and leaves dissimilar ones apart", () => {
    const spoolman = makeSpool("spoolman", "7", { crossIds: { spoolmanId: 7 } });
    const twin = makeSpool("spoolstock", "abc", { remainingWeight: 650 });
    const other = makeSpool("spoolstock", "def", { vendor: "Elegoo", colors: ["FF0000"] });
    const { groups, suggestions } = matchSpools([spoolman, twin, other]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      pair: ["spoolman:7", "spoolstock:abc"],
      groupIds: ["spoolman:7", "spoolstock:abc"],
    });
    expect(suggestions[0]?.reasons).toContain("same brand");
    // Suggestions merge nothing on their own.
    expect(groups.map((group) => group.status)).toEqual(["single", "single", "single"]);
  });

  test("a confirmed pair becomes linked, a rejected one is not suggested again", () => {
    const spoolman = makeSpool("spoolman", "7", { crossIds: { spoolmanId: 7 } });
    const twin = makeSpool("spoolstock", "abc");
    const pair = pairKey("spoolman:7", "spoolstock:abc");
    expect(
      matchSpools([spoolman, twin], { confirmed: [pair], rejected: [] }).groups[0]?.status,
    ).toBe("linked");
    const rejected = matchSpools([spoolman, twin], { confirmed: [], rejected: [pair] });
    expect(rejected.suggestions).toEqual([]);
    expect(rejected.groups.map((group) => group.status)).toEqual(["single", "single"]);
  });

  test("takes the best candidate when two look alike", () => {
    const spoolman = makeSpool("spoolman", "7", { crossIds: { spoolmanId: 7 }, upc: "123" });
    const close = makeSpool("spoolstock", "a", { upc: "123" });
    const far = makeSpool("spoolstock", "b", { remainingWeight: 100 });
    const { suggestions } = matchSpools([spoolman, close, far]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.pair).toEqual(["spoolman:7", "spoolstock:a"]);
  });
});

describe("similarity", () => {
  test("penalises different materials and colors", () => {
    const a = makeSpool("spoolman", "1");
    expect(similarity(a, makeSpool("spoolstock", "x", { material: "PETG" })).score).toBeLessThan(
      similarity(a, makeSpool("spoolstock", "y")).score,
    );
    expect(similarity(a, makeSpool("spoolstock", "z", { colors: ["FFFFFF"] })).reasons).toContain(
      "different color",
    );
  });
});
