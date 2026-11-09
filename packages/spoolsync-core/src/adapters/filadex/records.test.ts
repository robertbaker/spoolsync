import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { mapRecord, parseTemp } from "./map";
import { updateRecord } from "./records";
import type { FiladexRecord } from "./types";

type Update = Extract<PlannedChange, { kind: "update" }>;

const change = (
  changes: Array<[string, unknown, unknown]>,
  spool: Partial<Update["spool"]> = {},
): Update =>
  ({
    kind: "update",
    source: "filadex",
    groupId: "g",
    links: {},
    spool: { sourceId: "1", initialWeight: 1000, remainingWeight: 500, ...spool },
    changes: changes.map(([field, from, to]) => ({ field, from, to })),
  }) as unknown as Update;

test("a bed temperature in printTemp is not read as a nozzle temperature", () => {
  expect(parseTemp("215°C / Bed 60°C")).toEqual({ min: 215, max: 215 });
  expect(parseTemp("200-220°C / Bed 60°C")).toEqual({ min: 200, max: 220 });
  expect(parseTemp("Bed 60°C")).toEqual({ min: null, max: null });
  expect(parseTemp("200-220")).toEqual({ min: 200, max: 220 });
});

test("changing the nozzle range keeps the bed temperature", () => {
  const record: FiladexRecord = { printTemp: "215°C / Bed 60°C" };
  updateRecord(record, change([["nozzleTempMin", 215, 190]]), () => {});
  expect(record["printTemp"]).toBe("190-215 / Bed 60°C");
});

test("a spool without a bed temperature keeps the plain format", () => {
  const record: FiladexRecord = { printTemp: "215" };
  updateRecord(record, change([["nozzleTempMax", 215, 230]]), () => {});
  expect(record["printTemp"]).toBe("215-230");
});

test("the total weight keeps gram precision through a round trip", () => {
  const record: FiladexRecord = { totalWeight: "1", remainingPercentage: "50" };
  updateRecord(record, change([["initialWeight", 1000, 1234]]), () => {});
  expect(record["totalWeight"]).toBe("1.234");
  expect(mapRecord(record, 0).initialWeight).toBe(1234);
});

test("a remaining-only change does not round an existing total", () => {
  const record: FiladexRecord = { totalWeight: "0.333", remainingPercentage: "100" };
  updateRecord(
    record,
    change([["remainingWeight", 333, 111]], { initialWeight: 333, remainingWeight: 333 }),
    () => {},
  );
  expect(record["totalWeight"]).toBe("0.333");
});

test("a total under five grams is not lost", () => {
  const record: FiladexRecord = {};
  updateRecord(
    record,
    change([["initialWeight", null, 4]], { initialWeight: null, remainingWeight: 2 }),
    () => {},
  );
  expect(mapRecord(record, 0).initialWeight).toBe(4);
});
