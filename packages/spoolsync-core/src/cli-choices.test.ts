import { expect, test } from "bun:test";

import { deriveCliChoices } from "./cli-choices";
import { buildPlan, changeParts, omitExcluded } from "./core/compare";
import { matchSpools } from "./core/match";
import { makeSpool } from "./core/testing";

function setup() {
  const spools = [
    makeSpool("spoolman", "1", { remainingWeight: 500 }),
    makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 }, remainingWeight: 600 }),
  ];
  const match = matchSpools(spools, { confirmed: [], rejected: [] });
  const group = match.groups[0]!;
  return { match, group };
}

test("a plan made of one source's values per field maps to --resolve exactly", () => {
  const { match, group } = setup();
  const resolutions = new Map([[group.id, { values: { remainingWeight: 500 }, createIn: [] }]]);
  const plan = buildPlan(match.groups, resolutions);
  const choices = deriveCliChoices(
    match.groups,
    resolutions,
    { confirmed: ["spoolio:a|spoolman:1"], rejected: [] },
    [],
    plan,
    ["spoolman", "spoolio"],
  );
  expect(choices.resolves).toEqual([["remainingWeight", "spoolman"]]);
  expect(choices).toMatchObject({ extra: 0, missing: 0, confirm: ["spoolio:a,spoolman:1"] });
});

test("excluded changes are reported because the CLI cannot skip them", () => {
  const { match, group } = setup();
  const resolutions = new Map([[group.id, { values: { remainingWeight: 500 }, createIn: [] }]]);
  const plan = buildPlan(match.groups, resolutions);
  const key = changeParts([...plan.values()].flat()[0]!)[0]!.key;
  const choices = deriveCliChoices(
    match.groups,
    resolutions,
    { confirmed: [], rejected: [] },
    [],
    omitExcluded(plan, new Set([key])),
    ["spoolman", "spoolio"],
  );
  expect(choices.extra).toBe(1);
  expect(choices.missing).toBe(0);
});

test("automatic fill fields do not emit redundant --resolve flags", () => {
  const spools = [
    makeSpool("spoolman", "1", { vendor: "Prusament", remainingWeight: 500 }),
    makeSpool("spoolio", "a", { crossIds: { spoolmanId: 1 }, vendor: null, remainingWeight: 500 }),
  ];
  const match = matchSpools(spools, { confirmed: [], rejected: [] });
  const resolutions = new Map();
  const plan = buildPlan(match.groups, resolutions);
  const choices = deriveCliChoices(
    match.groups,
    resolutions,
    { confirmed: [], rejected: [] },
    [],
    plan,
    ["spoolman", "spoolio"],
  );
  expect(choices.resolves).toEqual([]);
  expect(choices.extra).toBe(0);
  expect(choices.missing).toBe(0);
});
