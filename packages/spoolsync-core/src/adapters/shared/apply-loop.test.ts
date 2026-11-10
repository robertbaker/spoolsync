import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { makeSpool } from "../../core/testing";
import { applyEachChange, changedFieldNames } from "./apply-loop";

const update = (id: string): PlannedChange => ({
  kind: "update",
  source: "spoolman",
  groupId: `group-${id}`,
  spool: makeSpool("spoolman", id),
  changes: [{ field: "remainingWeight", from: 1, to: 2 }],
  links: {},
});

test("each change is logged in order, with notes, and a failure does not stop the rest", async () => {
  const progress: Array<[number, number]> = [];
  const log = await applyEachChange(
    [update("1"), update("2"), update("3")],
    {
      async write(change, note) {
        if (change.groupId === "group-2") throw new Error("server said no");
        if (change.groupId === "group-3") {
          note("First.");
          note("Second.");
          note("First.");
        }
        return `Wrote ${change.groupId}`;
      },
      subject: (change) => `spool ${change.groupId}`,
    },
    (done, total) => progress.push([done, total]),
  );
  expect(log).toEqual([
    { groupId: "group-1", ok: true, message: "Wrote group-1" },
    { groupId: "group-2", ok: false, message: "Failed on spool group-2: server said no" },
    { groupId: "group-3", ok: true, message: "Wrote group-3 (First.; Second.)" },
  ]);
  expect(progress).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
});

test("a failure reports what was already written and keeps notes", async () => {
  const log = await applyEachChange([update("1")], {
    async write(_change, note) {
      note("Noticed.");
      throw new Error("archive failed");
    },
    subject: () => "spool 1",
    partialWrite: () => " Its other fields were saved.",
  });
  expect(log[0]!.message).toBe(
    "Failed on spool 1: archive failed (Noticed.) Its other fields were saved.",
  );
});

test("changed field names use the lower-case field labels", () => {
  const change = update("1");
  if (change.kind !== "update") throw new Error("expected an update");
  expect(changedFieldNames(change)).toEqual(["remaining (g)"]);
});
