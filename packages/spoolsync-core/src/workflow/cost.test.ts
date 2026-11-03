import { expect, test } from "bun:test";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { costPerKg } from "./cost";

const none = { confirmed: [], rejected: [] };
const result = (source: "spoolman" | "spoolio", spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "now",
});

test("cost per kilogram weights by full weight and ranks the dearest first", () => {
  const { rows, unpriced, totalSpools } = costPerKg(
    "material",
    [
      result("spoolman", [
        makeSpool("spoolman", "1", { material: "PLA", name: "A", price: 20, initialWeight: 1000 }),
        makeSpool("spoolman", "2", { material: "pla", name: "B", price: 10, initialWeight: 250 }),
        makeSpool("spoolman", "3", { material: "PETG", name: "C", price: 30, initialWeight: 1000 }),
        makeSpool("spoolman", "4", { material: "ABS", name: "D", price: null }),
        makeSpool("spoolman", "5", { material: "ABS", name: "E", price: 12, initialWeight: null }),
      ]),
    ],
    none,
  );
  expect(rows.map((row) => [row.label, Math.round(row.costPerKg * 100) / 100, row.spools])).toEqual(
    [
      ["PETG", 30, 1],
      ["PLA", 24, 2],
    ],
  );
  expect(unpriced).toBe(2);
  expect(totalSpools).toBe(5);
});

test("by service lists only services with prices, and a free spool counts as zero", () => {
  const { rows } = costPerKg(
    "service",
    [
      result("spoolio", [makeSpool("spoolio", "a", { price: null })]),
      result("spoolman", [
        makeSpool("spoolman", "1", { price: 0, initialWeight: 1000 }),
        makeSpool("spoolman", "2", { price: 20, initialWeight: 1000 }),
      ]),
    ],
    none,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ label: "Spoolman", costPerKg: 10, spools: 2 });
});

test("a linked spool is counted once, using whichever record has the price", () => {
  const { rows, totalSpools } = costPerKg(
    "vendor",
    [
      result("spoolman", [
        makeSpool("spoolman", "1", {
          vendor: "Prusa",
          name: "Same",
          price: null,
          colors: ["112233"],
        }),
      ]),
      result("spoolio", [
        makeSpool("spoolio", "a", {
          vendor: "Prusa",
          name: "Same",
          price: 25,
          initialWeight: 1000,
          colors: ["112233"],
          crossIds: { spoolmanId: 1 },
        }),
      ]),
    ],
    none,
  );
  expect(totalSpools).toBe(1);
  expect(rows).toEqual([
    { label: "Prusa", costPerKg: 25, spools: 1, totalPrice: 25, kilograms: 1 },
  ]);
});

test("no prices gives no rows, and a long tail folds into Other", () => {
  expect(
    costPerKg("service", [result("spoolman", [makeSpool("spoolman", "1", { price: null })])], none)
      .rows,
  ).toEqual([]);
  const many = Array.from({ length: 5 }, (_, i) =>
    makeSpool("spoolman", String(i + 1), {
      material: `M${i}`,
      name: `N${i}`,
      price: 10 + i * 10,
      initialWeight: 1000,
      colors: [`00000${i}`],
    }),
  );
  const { rows } = costPerKg("material", [result("spoolman", many)], none, 3);
  expect(rows.map((row) => row.label)).toEqual(["M4", "M3", "Other"]);
  expect(rows[2]).toMatchObject({ spools: 3, costPerKg: 20 });
});
