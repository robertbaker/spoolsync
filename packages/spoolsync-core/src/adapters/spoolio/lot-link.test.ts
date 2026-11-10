import { expect, test } from "bun:test";

import { spoolioToCommon } from "./map";
import { setField, setSpoolstockLink } from "./records";
import type { SpoolioFilament } from "./schema";

const load = (target: Record<string, unknown>) =>
  spoolioToCommon({ id: "s1", ...target } as unknown as SpoolioFilament);

test("a Spoolstock link in batchNumber is a link, not a lot number", () => {
  const spool = load({ batchNumber: "spoolstock:spool:abc" });
  expect(spool.lotNr).toBeNull();
  expect(spool.crossIds.spoolstockShortId).toBe("abc");
});

test("a real lot number is still read as one", () => {
  const spool = load({ batchNumber: "L1" });
  expect(spool.lotNr).toBe("L1");
  expect(spool.crossIds.spoolstockShortId).toBeUndefined();
});

test("writing a lot number over a link moves the link into the notes", () => {
  const target: Record<string, unknown> = {
    batchNumber: "spoolstock:spool:abc",
    notes: "Dry first",
  };
  setField(target, "lotNr", "L1");
  expect(target["batchNumber"]).toBe("L1");
  const spool = load(target);
  expect(spool.lotNr).toBe("L1");
  expect(spool.crossIds.spoolstockShortId).toBe("abc");
  expect(spool.comment).toBe("Dry first");
});

test("clearing the lot number never removes the link", () => {
  const target: Record<string, unknown> = { batchNumber: "spoolstock:spool:abc" };
  setField(target, "lotNr", null);
  expect(target["batchNumber"]).toBe("spoolstock:spool:abc");
});

test("the link survives note and material edits", () => {
  const target: Record<string, unknown> = { batchNumber: "spoolstock:spool:abc", type: "PLA" };
  setField(target, "lotNr", "L1");
  setField(target, "comment", "New note");
  setField(target, "material", "PLA-Glow");
  const spool = load(target);
  expect(spool.crossIds.spoolstockShortId).toBe("abc");
  expect(spool.comment).toBe("New note");
  expect(spool.material).toBe("PLA-Glow");
});

test("a new link uses batchNumber when free and the notes when a lot number is there", () => {
  const empty: Record<string, unknown> = {};
  setSpoolstockLink(empty, "abc");
  expect(empty["batchNumber"]).toBe("spoolstock:spool:abc");

  const withLot: Record<string, unknown> = { batchNumber: "L1" };
  setSpoolstockLink(withLot, "abc");
  expect(withLot["batchNumber"]).toBe("L1");
  expect(load(withLot).crossIds.spoolstockShortId).toBe("abc");
});

test("a different Spoolstock link in batchNumber is replaced, and the same one is left alone", () => {
  const target: Record<string, unknown> = { batchNumber: "spoolstock:spool:old", notes: "Dry" };
  setSpoolstockLink(target, "new");
  expect(target["batchNumber"]).toBe("spoolstock:spool:new");
  expect(target["notes"]).toBe("Dry");
  expect(load(target).crossIds.spoolstockShortId).toBe("new");
  setSpoolstockLink(target, "new");
  expect(target["batchNumber"]).toBe("spoolstock:spool:new");
});

test("a different Spoolstock link in the notes is replaced beside a real lot number", () => {
  const target: Record<string, unknown> = {
    batchNumber: "L1",
    notes: "[Spoolstock link: old]\nDry",
  };
  setSpoolstockLink(target, "new");
  expect(target["batchNumber"]).toBe("L1");
  expect(load(target).crossIds.spoolstockShortId).toBe("new");
  expect(load(target).comment).toBe("Dry");
});

test("single-value temperatures: a min write also sets max, and max writes are ignored", () => {
  const target: Record<string, unknown> = {
    nozzleTempMin: 190,
    nozzleTempMax: 230,
    bedTempMin: 50,
    bedTempMax: 60,
  };
  setField(target, "nozzleTempMin", 205);
  setField(target, "bedTempMin", 55);
  setField(target, "nozzleTempMax", 240);
  setField(target, "bedTempMax", 70);
  expect(target).toMatchObject({
    nozzleTempMin: 205,
    nozzleTempMax: 205,
    bedTempMin: 55,
    bedTempMax: 55,
  });
  setField(target, "nozzleTempMin", null);
  expect(target).toMatchObject({ nozzleTempMin: 0, nozzleTempMax: 0 });
});
