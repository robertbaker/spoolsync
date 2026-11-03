import { expect, test } from "bun:test";

import { pairKey } from "@spoolsync/core/core/match";
import { makeSpool } from "@spoolsync/core/core/testing";
import { findDuplicateSpools, spoolKey } from "@spoolsync/core/workflow";

import {
  detailRows,
  findSpoolDetail,
  linkedIds,
  markDifferent,
  recordTitle,
  spoolHistory,
} from "./spool-detail";

const none = { confirmed: [], rejected: [] };

test("an unknown key gives nothing", () => {
  expect(findSpoolDetail([makeSpool("spoolman", "1")], "spoolman:2", none)).toBeNull();
  expect(findSpoolDetail([], "spoolman:1", none)).toBeNull();
});

test("a spool linked by id shows every service's record, the opened one first", () => {
  const manager = makeSpool("spoolman", "12", { remainingWeight: 300 });
  const other = makeSpool("spoolio", "abc", {
    crossIds: { spoolmanId: 12 },
    remainingWeight: 250,
  });
  const unrelated = makeSpool("spoolman", "99", { vendor: "Elegoo", name: "Other" });

  const detail = findSpoolDetail([manager, other, unrelated], spoolKey(other), none)!;
  expect(detail.columns.map(spoolKey)).toEqual(["spoolio:abc", "spoolman:12"]);
  expect(detail.spool).toBe(other);

  const solo = findSpoolDetail([manager, other, unrelated], "spoolman:99", none)!;
  expect(solo.columns).toEqual([unrelated]);
});

test("rows list every field and flag the ones the services disagree about", () => {
  const a = makeSpool("spoolman", "12", { remainingWeight: 300, location: null, colors: ["FF0000"] });
  const b = makeSpool("spoolio", "abc", {
    crossIds: { spoolmanId: 12 },
    remainingWeight: 250,
    location: "Shelf 2",
    colors: ["FF0000"],
  });
  const rows = detailRows([a, b]);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  expect(byId["remainingWeight"]).toMatchObject({ kind: "weight", values: [300, 250], differs: true });
  // A value in one service and none in the other is a difference worth showing.
  expect(byId["location"]).toMatchObject({ values: [null, "Shelf 2"], differs: true });
  expect(byId["vendor"]!.differs).toBe(false);
  expect(byId["colors"]).toMatchObject({ kind: "colors", differs: false });
  // Service ids always differ and are not conflicts.
  expect(byId["sourceId"]!.differs).toBe(false);
  expect(rows.map((row) => row.id)).toContain("lotNr");
  // A single record has nothing to disagree with.
  expect(detailRows([a]).every((row) => !row.differs)).toBe(true);
  expect(detailRows([])).toHaveLength(rows.length);
});

test("an empty value on both sides does not count as a difference", () => {
  const a = makeSpool("spoolman", "1", { comment: "" });
  const b = makeSpool("spoolio", "2", { comment: null, colors: [] });
  const rows = detailRows([a, b]);
  expect(rows.find((row) => row.id === "comment")!.differs).toBe(false);
});

test("duplicates in the same service are offered as candidates for 'different'", () => {
  const first = makeSpool("spoolman", "1", { remainingWeight: 500, purchasedOn: "2025-01-01" });
  const second = makeSpool("spoolman", "2", { remainingWeight: 500, purchasedOn: "2025-01-01" });
  const duplicates = findDuplicateSpools([{ source: "spoolman", spools: [first, second], warnings: [], loadedAt: "2026-01-01T00:00:00Z" }]);
  expect(duplicates.length).toBe(1);
  const detail = findSpoolDetail([first, second], "spoolman:1", none, duplicates)!;
  expect(detail.candidates).toHaveLength(1);
  expect(detail.candidates[0]).toMatchObject({
    reason: "duplicate",
    pair: ["spoolman:1", "spoolman:2"],
  });
  expect(detail.candidates[0]!.spool).toBe(second);
});

test("a confirmed link can be taken back from the spool's own drawer", () => {
  const a = makeSpool("spoolman", "1", { name: "Alpha", vendor: "A", material: "PLA", colors: ["010203"] });
  const b = makeSpool("spoolio", "2", { name: "Beta", vendor: "B", material: "PETG", colors: ["FFFFFF"] });
  const decisions = { confirmed: [pairKey("spoolman:1", "spoolio:2")], rejected: [] };
  const detail = findSpoolDetail([a, b], "spoolman:1", decisions)!;
  expect(detail.columns.map(spoolKey)).toEqual(["spoolman:1", "spoolio:2"]);
  expect(detail.candidates).toMatchObject([{ reason: "confirmed", pair: ["spoolman:1", "spoolio:2"] }]);
});

test("marking two records as different stores the pair once and drops a confirmation", () => {
  const pair = pairKey("spoolio:2", "spoolman:1");
  const decisions = { confirmed: [pair, "x|y"], rejected: ["old|pair"] };
  const next = markDifferent(decisions, "spoolman:1", "spoolio:2");
  expect(next).toEqual({ confirmed: ["x|y"], rejected: ["old|pair", pair] });
  // Saying it twice changes nothing more, and the input is not mutated.
  expect(markDifferent(next, "spoolio:2", "spoolman:1")).toEqual(next);
  expect(decisions.confirmed).toHaveLength(2);
});

test("linked ids are labelled and ordered, ignoring blanks", () => {
  const spool = makeSpool("spoolio", "abc", {
    crossIds: { spoolmanId: 12, tigertagUid: "04AABB", spoolioId: "", bambuddyId: 0 },
  });
  expect(linkedIds(spool)).toEqual([
    { label: "Spoolman", value: "12" },
    { label: "TigerTag", value: "04AABB" },
    { label: "Bambuddy", value: "0" },
  ]);
  expect(linkedIds(makeSpool("spoolio", "x", { crossIds: {} }))).toEqual([]);
});

test("history combines the latest weight change with the service's last few totals", () => {
  const spool = makeSpool("spoolman", "12");
  const point = (n: number) => ({ at: `2026-01-0${n}T00:00:00.000Z`, totalGrams: n * 100, spoolCount: n });
  const change = { id: "12", name: "x", before: 500, after: 400, delta: -100 };
  const history = { spoolman: [1, 2, 3, 4, 5, 6, 7].map(point), spoolio: [point(1)] };
  const result = spoolHistory(spool, new Map([["spoolman:12", change]]), history);
  expect(result.change).toBe(change);
  expect(result.serviceTrail.map((p) => p.spoolCount)).toEqual([3, 4, 5, 6, 7]);
  expect(spoolHistory(spool, new Map(), {})).toEqual({ change: null, serviceTrail: [] });
  expect(recordTitle(spool)).toBe("Spoolman 12");
});
