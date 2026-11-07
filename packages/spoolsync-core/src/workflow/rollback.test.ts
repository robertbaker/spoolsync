import { describe, expect, test } from "bun:test";

import type { PlannedChange, PlannedUpdate } from "../core/comparison/types";
import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import {
  buildRollback,
  parseRollback,
  planRollback,
  serializeRollback,
  type RollbackDocument,
} from "./rollback";

const now = new Date("2026-11-04T10:00:00.000Z");

const update = (
  id: string,
  changes: PlannedUpdate["changes"],
  over: Partial<PlannedUpdate> = {},
): PlannedUpdate => ({
  kind: "update",
  source: "spoolman",
  groupId: `g${id}`,
  spool: makeSpool("spoolman", id, { vendor: "Prusament", material: "PLA", name: `Galaxy ${id}` }),
  changes,
  links: {},
  ...over,
});

const creation = (): PlannedChange => ({
  kind: "create",
  source: "spoolman",
  groupId: "gc",
  values: {
    ...makeSpool("spoolman", "x"),
    vendor: "Acme",
    material: "PETG",
    name: "Teal",
  } as never,
  links: {},
  groupIds: {},
});

const inventory = (spools: LoadResult["spools"]): LoadResult => ({
  source: "spoolman",
  spools,
  warnings: [],
  loadedAt: "2026-11-04T10:05:00.000Z",
});

describe("buildRollback", () => {
  test("records the earlier and the written value of each changed field, and what was created", () => {
    const document = buildRollback(
      "spoolman",
      [
        update("1", [
          { field: "density", from: null, to: 1.24 },
          { field: "name", from: "Old", to: "Galaxy 1" },
        ]),
        update("2", [], { links: { spoolioId: "a" } as never }),
        creation(),
      ],
      { target: "Spoolman at http://localhost:7912", now },
    );
    expect(document).toMatchObject({
      format: "spoolsync-rollback",
      version: 1,
      createdAt: "2026-11-04T10:00:00.000Z",
      source: "spoolman",
      service: "Spoolman",
      target: "Spoolman at http://localhost:7912",
    });
    // The spool whose only change was a stamped id has nothing to put back.
    expect(document.updates).toEqual([
      {
        sourceId: "1",
        label: "Prusament PLA Galaxy 1",
        changes: [
          { field: "density", before: null, after: 1.24 },
          { field: "name", before: "Old", after: "Galaxy 1" },
        ],
      },
    ]);
    expect(document.creations).toEqual([{ label: "Acme PETG Teal" }]);
    expect(JSON.stringify(document)).not.toContain("spoolioId");
  });
});

describe("parseRollback", () => {
  const good = (): RollbackDocument =>
    buildRollback("spoolman", [update("1", [{ field: "density", from: null, to: 1.24 }])], {
      target: "t",
      now,
    });

  test("round-trips what was written", () => {
    expect(parseRollback(serializeRollback(good()))).toEqual(good());
  });

  test("refuses anything that is not a usable rollback file, with a plain message", () => {
    expect(() => parseRollback("{oops")).toThrow("not valid JSON");
    expect(() => parseRollback("[]")).toThrow("not a SpoolSync rollback file");
    expect(() => parseRollback(JSON.stringify({ ...good(), version: 2 }))).toThrow(
      "different version",
    );
    expect(() => parseRollback(JSON.stringify({ ...good(), source: "spoolstock" }))).toThrow(
      "cannot write to",
    );
    expect(() => parseRollback(JSON.stringify({ ...good(), updates: [], creations: [] }))).toThrow(
      "nothing in it",
    );
    expect(() => parseRollback(JSON.stringify({ ...good(), updates: "x" }))).toThrow(
      "no usable list",
    );
  });

  test("drops entries that are malformed instead of trusting them", () => {
    const raw = JSON.parse(serializeRollback(good()));
    raw.updates.push(
      { sourceId: "", changes: [] },
      { sourceId: "9", changes: [{ field: "nope", before: 1, after: 2 }] },
      { sourceId: "8", changes: [{ field: "density", before: { x: 1 }, after: 2 }] },
      { sourceId: "7", changes: [{ field: "density", before: 1, after: 2 }], label: "Seven" },
      "junk",
    );
    const parsed = parseRollback(JSON.stringify(raw));
    expect(parsed.updates.map((item) => item.sourceId)).toEqual(["1", "7"]);
  });
});

describe("planRollback", () => {
  const document = buildRollback(
    "spoolman",
    [
      update("1", [
        { field: "density", from: null, to: 1.24 },
        { field: "name", from: "Old", to: "New" },
      ]),
      update("2", [{ field: "diameter", from: 2.85, to: 1.75 }]),
      update("3", [{ field: "density", from: null, to: 1.3 }]),
      creation(),
    ],
    { target: "t", now },
  );

  test("puts back only fields that still hold what SpoolSync wrote", () => {
    const plan = planRollback(
      document,
      inventory([
        makeSpool("spoolman", "1", { density: 1.24, name: "Edited since" }),
        makeSpool("spoolman", "2", { diameter: 1.75 }),
      ]),
    );
    expect(plan.fields).toBe(2);
    expect(plan.changes.map((change) => [change.spool.sourceId, change.changes])).toEqual([
      ["1", [{ field: "density", from: 1.24, to: null }]],
      ["2", [{ field: "diameter", from: 1.75, to: 2.85 }]],
    ]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ field: "name", reason: expect.stringContaining("changed again") }),
      expect.objectContaining({ field: null, reason: "is no longer in the service" }),
    ]);
    expect(plan.creations).toEqual([{ label: "Acme PETG Teal" }]);
  });

  test("a field that already has its earlier value is not written again", () => {
    const plan = planRollback(
      document,
      inventory([makeSpool("spoolman", "1", { density: null, name: "Old" })]),
    );
    expect(plan.changes).toEqual([]);
    expect(
      plan.skipped.filter((item) => item.reason === "already has its earlier value"),
    ).toHaveLength(2);
  });

  test("restored updates are ordinary planned updates for the service", () => {
    const [change] = planRollback(
      document,
      inventory([makeSpool("spoolman", "3", { density: 1.3 })]),
    ).changes;
    expect(change).toMatchObject({ kind: "update", source: "spoolman", links: {} });
    expect(change!.groupId).toBe("rollback:3");
  });

  test("refuses a mismatched inventory service and skips already-restored cleanup casing edits", () => {
    expect(() =>
      planRollback(document, {
        source: "spoolio",
        spools: [],
        warnings: [],
        loadedAt: "2026-11-04T10:05:00.000Z",
      }),
    ).toThrow(/The rollback file is for Spoolman, not Spoolio/);

    const cleanupDoc = buildRollback(
      "spoolman",
      [update("1", [{ field: "vendor", from: "prusament", to: "Prusament" }])],
      { target: "t", now },
    );
    const alreadyRestored = planRollback(
      cleanupDoc,
      inventory([makeSpool("spoolman", "1", { vendor: "prusament" })]),
    );
    expect(alreadyRestored.changes).toEqual([]);
    expect(alreadyRestored.skipped[0]?.reason).toBe("already has its earlier value");
  });
});
