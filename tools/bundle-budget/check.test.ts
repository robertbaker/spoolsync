import { expect, test } from "bun:test";

import { checkBudgets } from "./check";

const budgets = { totalJs: 1000, largestJs: 600, totalCss: 300 };

test("sizes within every budget pass and are totalled", () => {
  const report = checkBudgets(
    [
      { file: "a.js", gzipBytes: 500 },
      { file: "b.js", gzipBytes: 400 },
      { file: "c.css", gzipBytes: 200 },
      { file: "d.svg", gzipBytes: 9999 },
    ],
    budgets,
  );
  expect(report.failures).toEqual([]);
  expect(report.totals).toMatchObject({ js: 900, css: 200, largestJs: { file: "a.js" } });
});

test("each budget names what grew", () => {
  const report = checkBudgets(
    [
      { file: "big.js", gzipBytes: 700 },
      { file: "other.js", gzipBytes: 400 },
      { file: "x.css", gzipBytes: 301 },
    ],
    budgets,
  );
  expect(report.failures).toHaveLength(3);
  expect(report.failures.join(" ")).toContain("big.js is 0.7 kB");
  expect(report.failures.join(" ")).toContain("CSS is 0.3 kB");
});

test("no scripts at all is not an error", () => {
  expect(checkBudgets([], budgets)).toMatchObject({
    failures: [],
    totals: { js: 0, largestJs: null },
  });
});
