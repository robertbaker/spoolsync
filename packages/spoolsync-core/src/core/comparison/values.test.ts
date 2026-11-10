import { expect, test } from "bun:test";

import { clusterByTolerance, valuesEqual } from "./values";

test("tolerance clusters do not depend on the order values are listed in", () => {
  const values = [215, 215.5, 216];
  const orders = [
    [0, 1, 2],
    [2, 1, 0],
    [1, 0, 2],
    [1, 2, 0],
    [0, 2, 1],
    [2, 0, 1],
  ];
  const partitions = orders.map((order) => {
    const clusters = clusterByTolerance(
      "nozzleTempMin",
      order.map((index) => values[index]!),
    );
    const byValue = new Map(order.map((index, position) => [values[index]!, clusters[position]!]));
    return values.map((value) => byValue.get(value)).join(",");
  });
  expect(new Set(partitions).size).toBe(1);
  expect(partitions[0]).toBe("0,0,1");
});

test("the 64-character cut only counts as equal for Spoolman", () => {
  const full = "x".repeat(70);
  const cut = "x".repeat(64);
  expect(valuesEqual("name", cut, full)).toBe(true);
  expect(valuesEqual("name", cut, full, "spoolman")).toBe(true);
  expect(valuesEqual("name", cut, full, "spoolio")).toBe(false);
});
