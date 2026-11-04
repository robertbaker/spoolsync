import { expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";
import { combinedInventoryCsv } from "@spoolsync/core/workflow";

import { asLoadResult, viewFilename, viewJson } from "./table-export";

const spools = [
  makeSpool("spoolio", "b", { name: "=cmd()", remainingWeight: 100, colors: ["FF0000", "00FF00"] }),
  makeSpool("spoolman", "a", { name: "Second", remainingWeight: null, price: Number.NaN }),
];

test("the CSV keeps table order across services and neutralises formulas", () => {
  const { csv, rows } = combinedInventoryCsv([asLoadResult(spools, "2026-01-01T00:00:00Z")]);
  expect(rows).toBe(2);
  const lines = csv.trim().split(/\r\n/);
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain("'=cmd()");
  expect(lines[1]!.startsWith("Spoolio,b")).toBe(true);
  expect(lines[2]!.startsWith("Spoolman,a")).toBe(true);
});

test("an empty view still gives a header row", () => {
  const { csv, rows } = combinedInventoryCsv([asLoadResult([], "2026-01-01T00:00:00Z")]);
  expect(rows).toBe(0);
  expect(csv.split(/\r\n/)[0]).toContain("remaining_weight_g");
});

test("the JSON has the common model in grams, in order, without raw records", () => {
  const json = JSON.parse(viewJson(spools, "2026-02-03T04:05:06.000Z"));
  expect(json).toMatchObject({
    format: "spoolsync-view",
    version: 1,
    exportedAt: "2026-02-03T04:05:06.000Z",
    count: 2,
  });
  expect(json.spools.map((spool: { id: string }) => spool.id)).toEqual(["b", "a"]);
  expect(json.spools[0]).toMatchObject({
    service: "Spoolio",
    colors: ["#FF0000", "#00FF00"],
    remainingWeightG: 100,
    initialWeightG: 1000,
  });
  expect(json.spools[0]).not.toHaveProperty("raw");
  // Unknown and non-finite numbers become null rather than invalid JSON.
  expect(json.spools[1]).toMatchObject({ remainingWeightG: null, price: null });
});

test("filenames carry the date and the format", () => {
  const now = new Date("2026-11-03T23:30:00Z");
  expect(viewFilename("csv", now)).toBe("spoolsync-view-2026-11-03.csv");
  expect(viewFilename("json", now)).toBe("spoolsync-view-2026-11-03.json");
});
