import { expect, test } from "bun:test";

import { findMatches } from "@spoolsync/core/planner";

import { sampleInventories } from "./sample-data";

test("sample inventories load cleanly and exercise matching", async () => {
  const results = await sampleInventories();
  expect(results.map((result) => result.source)).toEqual(["spoolio", "filameter"]);
  expect(results.every((result) => result.warnings.length === 0)).toBe(true);
  expect(results.map((result) => result.spools.length)).toEqual([4, 4]);
  const ids = results.flatMap((result) => result.spools.map((spool) => spool.sourceId));
  expect(ids.every((id) => id.startsWith("sample-"))).toBe(true);

  const match = findMatches(
    results.flatMap((result) => result.spools),
    { confirmed: [], rejected: [] },
  );
  // Three look-alike pairs are suggested, and nothing is linked without an answer.
  expect(match.suggestions.length).toBe(3);
  expect(match.groups.filter((group) => group.status === "linked")).toHaveLength(0);
});
