import { expect, test } from "bun:test";

import Papa from "papaparse";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { combinedInventoryCsv } from "./combined";

const result = (source: "spoolman" | "spoolio", spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "now",
});

test("combines every loaded service into one tagged, spreadsheet-safe CSV", () => {
  const { csv, rows } = combinedInventoryCsv([
    result("spoolman", [
      makeSpool("spoolman", "1", {
        name: '=HYPERLINK("http://evil")',
        colors: ["FF0000", "00FF00"],
        comment: "line one\nline two, with comma",
        archived: true,
        price: 12.5,
      }),
    ]),
    result("spoolio", [makeSpool("spoolio", "a", { vendor: "-cmd", location: null })]),
  ]);
  expect(rows).toBe(2);
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  expect(parsed.errors).toEqual([]);
  expect(parsed.data).toHaveLength(2);
  expect(parsed.data[0]).toMatchObject({
    service: "Spoolman",
    id: "1",
    name: `'=HYPERLINK("http://evil")`,
    colors: "#FF0000 #00FF00",
    comment: "line one\nline two, with comma",
    archived: "true",
    price: "12.5",
  });
  expect(parsed.data[1]).toMatchObject({ service: "Spoolio", vendor: "'-cmd", location: "" });
  expect(csv.endsWith("\r\n")).toBe(true);
});

test("an empty inventory still yields a header row", () => {
  const { csv, rows } = combinedInventoryCsv([]);
  expect(rows).toBe(0);
  expect(csv.split("\r\n")[0]).toContain("service,id,vendor");
});
