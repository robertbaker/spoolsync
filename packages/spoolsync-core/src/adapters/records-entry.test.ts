import { expect, test } from "bun:test";

import { loadFiladexFile, loadFiladexRecords } from "./filadex/load";
import { loadFilamentDbFile, loadFilamentDbRecords } from "./filamentdb/load";
import { loadFilamentDbAppFile, loadFilamentDbAppRecords } from "./filamentDbApp/load";

/** `loadedAt` is a clock reading; everything else must be identical. */
const stable = <T extends { loadedAt: string }>(result: T) => ({ ...result, loadedAt: "" });

const outcome = (run: () => { loadedAt: string }) => {
  try {
    return stable(run());
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
};

const same = (
  value: unknown,
  fromText: (text: string) => { loadedAt: string },
  fromValue: (value: unknown) => { loadedAt: string },
) =>
  expect(outcome(() => fromValue(value))).toEqual(outcome(() => fromText(JSON.stringify(value))));

test("Filadex records load identically to the same JSON as text", () => {
  for (const value of [
    [],
    [{ id: 1, material: "PLA", colorName: "Red", extra: { keep: ["me", null] } }],
    [{ id: 1, material: "PLA" }, "nope", null, { id: 2 }, [1]],
    {},
    { filaments: [] },
  ])
    same(value, loadFiladexFile, loadFiladexRecords);
});

test("FilamentDB records load identically to the same JSON as text", () => {
  const spool = { serial: "A1", type: "PLA", weightRemaining: 400, unknownField: { a: [1, null] } };
  for (const value of [
    [],
    [spool],
    { spools: [spool, { serial: "" }, 3] },
    spool,
    [{ serial: "" }, null],
    "text",
    null,
  ])
    same(value, loadFilamentDbFile, loadFilamentDbRecords);
});

test("Filament DB snapshots load identically to the same JSON as text", () => {
  const snapshot = {
    collections: {
      locations: [{ _id: "l1", name: "Box" }],
      filaments: [
        {
          _id: "f1",
          vendor: "Prusament",
          type: "PLA",
          color: "#112233",
          spools: [{ _id: "s1", locationId: "l1", unknown: { x: 1 } }, { nope: true }],
        },
        { _id: "f2", _deletedAt: "2026-01-01", vendor: "X" },
      ],
    },
  };
  for (const value of [
    snapshot,
    snapshot.collections.filaments,
    { filaments: [], locations: [] },
    { filaments: [{ _id: "f", name: "no vendor or type" }] },
    {},
    [],
    "csv,like",
    42,
    null,
  ])
    same(value, loadFilamentDbAppFile, loadFilamentDbAppRecords);
});
