import { expect, test } from "bun:test";

import { makeSpool } from "../core/testing";
import { diffSnapshots, formatChanges, hasChanges, snapshotInventory } from "./changes";

const spool = (id: string, remainingWeight: number | null, name = "Red") =>
  makeSpool("spoolio", id, { vendor: "Prusa", material: "PLA", name, remainingWeight });

test("snapshots are sorted and ignore duplicate keys", () => {
  const snapshot = snapshotInventory(
    [spool("b", 1), spool("a", 2), spool("a", 3)],
    ["z,y", "a,b", "a,b"],
  );
  expect(snapshot.spools.map((item) => [item.key, item.remainingGrams])).toEqual([
    ["spoolio:a", 2],
    ["spoolio:b", 1],
  ]);
  expect(snapshot.pendingMatches).toEqual(["a,b", "z,y"]);
});

test("reports added, removed, weight changes, and new pending matches in key order", () => {
  const previous = snapshotInventory(
    [spool("a", 500), spool("b", 100), spool("c", null)],
    ["x:1,y:1"],
  );
  const next = snapshotInventory(
    [spool("a", 450), spool("c", 80), spool("d", 900), spool("e", 10)],
    ["x:1,y:1", "x:2,y:2"],
  );
  const changes = diffSnapshots(previous, next);
  expect(changes.added.map((item) => item.key)).toEqual(["spoolio:d", "spoolio:e"]);
  expect(changes.removed.map((item) => item.key)).toEqual(["spoolio:b"]);
  expect(changes.remainingWeight).toEqual([
    { key: "spoolio:a", label: "Prusa PLA Red", fromGrams: 500, toGrams: 450 },
    { key: "spoolio:c", label: "Prusa PLA Red", fromGrams: null, toGrams: 80 },
  ]);
  expect(changes.newPendingMatches).toEqual(["x:2,y:2"]);
  expect(formatChanges(changes)).toEqual([
    "Changes since the last run:",
    "  + added spoolio:d (Prusa PLA Red)",
    "  + added spoolio:e (Prusa PLA Red)",
    "  - removed spoolio:b (Prusa PLA Red)",
    "  ~ spoolio:a (Prusa PLA Red): 500 g -> 450 g remaining",
    "  ~ spoolio:c (Prusa PLA Red): unknown -> 80 g remaining",
    "  ? new possible match x:2,y:2",
  ]);
});

test("identical snapshots, relabels, and resolved matches are not changes", () => {
  const previous = snapshotInventory([spool("a", 5, "Red")], ["p,q"]);
  const next = snapshotInventory([spool("a", 5, "Crimson")], []);
  const changes = diffSnapshots(previous, next);
  expect(hasChanges(changes)).toBe(false);
  expect(formatChanges(changes)).toEqual([]);
});
