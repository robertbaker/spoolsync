import { describe, expect, test } from "bun:test";

import { dryingFor, dryingGroupName, groupDrying, spoolsToDry, typicalDrying } from "./drying";
import { makeSpool } from "./testing";

describe("typical drying settings", () => {
  test("recognise common material spellings and blends", () => {
    expect(typicalDrying("PETG")).toMatchObject({ tempC: 65, moisture: "medium" });
    expect(typicalDrying("PET-G")).toEqual(typicalDrying("PETG"));
    expect(typicalDrying("PETG-CF")).toEqual(typicalDrying("PETG"));
    expect(typicalDrying("Nylon")).toMatchObject({ tempC: 80, hours: 12, moisture: "high" });
    expect(typicalDrying("PA12-CF")).toEqual(typicalDrying("Nylon"));
    expect(typicalDrying("PAHT-CF")).toEqual(typicalDrying("Nylon"));
    expect(typicalDrying("PCTG")).toMatchObject({ moisture: "medium", tempC: 65 });
    expect(typicalDrying("PC")).toMatchObject({ tempC: 80 });
    expect(typicalDrying("pva")).toMatchObject({ moisture: "high" });
    expect(typicalDrying("PLA+")).toMatchObject({ moisture: "low" });
    expect(typicalDrying("TPU 95A")).toMatchObject({ moisture: "medium" });
  });

  test("have nothing to say about an unknown or missing material", () => {
    expect(typicalDrying("Wood-filled")).toBeNull();
    expect(typicalDrying("")).toBeNull();
    expect(typicalDrying(null)).toBeNull();
  });

  test("name the group a material belongs to", () => {
    expect(dryingGroupName("PA12-CF")).toBe("Nylon (PA)");
    expect(dryingGroupName("Wood-filled")).toBe("Wood-filled");
    expect(dryingGroupName(null)).toBe("Unknown material");
  });
});

describe("dryingFor", () => {
  test("uses the usual figures when there is no catalog record", () => {
    expect(dryingFor("PETG")).toEqual({
      tempC: 65,
      hours: 6,
      moisture: "medium",
      origin: "typical",
    });
    expect(dryingFor("Mystery")).toBeNull();
  });

  test("lets catalog figures win and fills the gap from the usual ones", () => {
    expect(dryingFor("PETG", { dryingTemp: 70, dryingHours: 4 })).toEqual({
      tempC: 70,
      hours: 4,
      moisture: "medium",
      origin: "catalog",
    });
    expect(dryingFor("PETG", { dryingTemp: 70 })).toMatchObject({
      tempC: 70,
      hours: 6,
      origin: "catalog",
    });
    // A catalog that gives drying settings makes an otherwise unknown material worth listing.
    expect(dryingFor("Mystery", { dryingTemp: 50, dryingHours: 3 })).toMatchObject({
      moisture: "medium",
      origin: "catalog",
    });
    expect(dryingFor("PETG", { dryingTemp: null, dryingHours: null })?.origin).toBe("typical");
  });
});

describe("spoolsToDry", () => {
  const spool = (id: string, material: string, extra = {}) =>
    makeSpool("spoolman", id, { vendor: "Acme", name: `Spool ${id}`, material, ...extra });

  test("lists moisture-prone spools, leaving out PLA, archived and empty ones", () => {
    const list = spoolsToDry([
      spool("1", "PETG"),
      spool("2", "PLA"),
      spool("3", "Nylon"),
      spool("4", "PETG", { archived: true }),
      spool("5", "PETG", { remainingWeight: 0 }),
      spool("6", "Mystery"),
      spool("7", "PVA", { remainingWeight: null }),
    ]);
    expect(list.map((entry) => entry.spool.sourceId)).toEqual(["3", "7", "1"]);
  });

  test("can include materials that rarely need drying", () => {
    const list = spoolsToDry([spool("1", "PLA"), spool("2", "PETG")], { includeLow: true });
    expect(list.map((entry) => entry.spool.sourceId)).toEqual(["2", "1"]);
  });

  test("takes catalog figures for the spools that have a record", () => {
    const list = spoolsToDry([spool("1", "PETG"), spool("2", "PETG")], {
      catalogFor: (item) => (item.sourceId === "2" ? { dryingTemp: 70, dryingHours: 5 } : null),
    });
    expect(
      list.map((entry) => [entry.spool.sourceId, entry.advice.origin, entry.advice.tempC]),
    ).toEqual([
      ["1", "typical", 65],
      ["2", "catalog", 70],
    ]);
  });

  test("groups spools that share material and settings", () => {
    const groups = groupDrying(
      spoolsToDry([spool("1", "PA12"), spool("2", "Nylon"), spool("3", "PETG")]),
    );
    expect(groups.map((group) => [group.material, group.entries.length])).toEqual([
      ["Nylon (PA)", 2],
      ["PETG", 1],
    ]);
  });
});
