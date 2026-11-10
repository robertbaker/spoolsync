import { expect, test } from "bun:test";

import { buildPlan, changeParts, comparePair, omitExcluded } from "../compare";
import { matchSpools } from "../match";
import { makeSpool } from "../testing";

test("comparePair marks differing fields and ignores case, spacing and sub-gram noise", () => {
  const rows = comparePair(
    makeSpool("spoolman", "1", { vendor: "Prusament", remainingWeight: 640, location: "Shelf A" }),
    makeSpool("spoolio", "a", { vendor: " prusament ", remainingWeight: 640.3, name: "Other" }),
  );
  const status = Object.fromEntries(rows.map((row) => [row.field, row.status]));
  expect(status).toMatchObject({
    vendor: "same",
    remainingWeight: "same",
    name: "differs",
    colors: "same",
    // Spoolio has no place for a location, so it cannot be compared.
    location: "unsupported",
  });
  expect(rows.find((row) => row.field === "location")?.right).toBe("Not stored");
  expect(rows.map((row) => row.label).slice(0, 3)).toEqual(["Brand", "Material", "Color"]);
});

test("comparePair keeps a 64-character cut as a difference unless Spoolman is involved", () => {
  const full = "x".repeat(70);
  const cut = "x".repeat(64);
  const status = (a: "spoolio" | "spoolman", b: "spoolio" | "spoolstock") =>
    comparePair(makeSpool(a, "1", { name: full }), makeSpool(b, "2", { name: cut })).find(
      (row) => row.field === "name",
    )?.status;
  expect(status("spoolman", "spoolio")).toBe("same");
  expect(status("spoolio", "spoolstock")).toBe("differs");
});

function fixture() {
  const spools = [
    makeSpool("spoolman", "1", { remainingWeight: 500 }),
    makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 }, remainingWeight: 600 }),
    makeSpool("spoolman", "2", { name: "Solo", crossIds: { spoolmanId: 2 } }),
  ];
  const { groups } = matchSpools(spools, { confirmed: [], rejected: [] });
  const resolutions = new Map(
    groups.map((group) => [
      group.id,
      {
        values: group.members.spoolman?.sourceId === "1" ? { remainingWeight: 500 } : {},
        createIn: group.members.spoolio ? [] : ["spoolio" as const],
      },
    ]),
  );
  return buildPlan(groups, resolutions);
}

test("omitExcluded removes single parts and drops emptied changes without touching the plan", () => {
  const plan = fixture();
  const all = [...plan.values()].flat();
  const parts = all.flatMap((change) => changeParts(change));
  expect(parts.filter((part) => part.kind === "field")).toHaveLength(1);
  expect(parts.filter((part) => part.kind === "create")).toHaveLength(1);

  const unchanged = omitExcluded(plan, new Set());
  expect([...unchanged.values()].flat()).toHaveLength(all.length);

  const field = parts.find((part) => part.kind === "field")!;
  const without = omitExcluded(plan, new Set([field.key]));
  const stillThere = [...without.values()].flat();
  expect(stillThere.some((change) => change.kind === "update" && change.changes.length)).toBe(
    false,
  );
  expect([...plan.values()].flat()).toHaveLength(all.length);

  const create = parts.find((part) => part.kind === "create")!;
  expect(
    [...omitExcluded(plan, new Set([create.key])).values()].flat().some((c) => c.kind === "create"),
  ).toBe(false);
});
