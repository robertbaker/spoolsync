import { expect, test } from "bun:test";

import { findMatches } from "@spoolsync/core/planner";

import { loadBulkEdits, saveBulkEdits } from "./browser/storage/bulk-edits";
import { loadAcceptedCleanups, saveAcceptedCleanups } from "./browser/storage/cleanup";
import {
  loadAcceptedReferences,
  loadReferenceChoices,
  loadReferenceRuledOut,
  saveAcceptedReferences,
  saveReferenceChoices,
  saveReferenceRuledOut,
} from "./browser/storage/reference";
import { clearSampleData, sampleInventories } from "./sample-data";

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

test("clearSampleData removes sample entries across all workspace state maps and sets", () => {
  localStorage.clear();
  sessionStorage.clear();
  try {
    saveBulkEdits(
      new Map([
        ["spoolio:sample-1", { location: "Shelf A" }],
        ["spoolio:real-1", { location: "Shelf B" }],
      ]),
    );
    saveAcceptedCleanups([
      { spoolKey: "spoolio:sample-1", field: "vendor", before: "prusament", after: "Prusament" },
      { spoolKey: "spoolio:real-1", field: "vendor", before: "bambu", after: "Bambu" },
    ]);
    saveAcceptedReferences([
      {
        spoolKey: "spoolio:sample-1",
        field: "colors",
        before: [],
        after: ["000000"],
        providerId: "3dfp",
        referenceId: "ref-1",
      },
      {
        spoolKey: "spoolio:real-1",
        field: "colors",
        before: [],
        after: ["FFFFFF"],
        providerId: "3dfp",
        referenceId: "ref-2",
      },
    ]);
    saveReferenceChoices(
      new Map([
        ["spoolio:sample-1", "ref-1"],
        ["spoolio:real-1", "ref-2"],
      ]),
    );
    saveReferenceRuledOut(["spoolio:sample-1", "spoolio:real-1"]);

    clearSampleData(["spoolio", "filameter"]);

    expect([...loadBulkEdits().keys()]).toEqual(["spoolio:real-1"]);
    expect(loadAcceptedCleanups().map((item) => item.spoolKey)).toEqual(["spoolio:real-1"]);
    expect(loadAcceptedReferences().map((item) => item.spoolKey)).toEqual(["spoolio:real-1"]);
    expect([...loadReferenceChoices().keys()]).toEqual(["spoolio:real-1"]);
    expect(loadReferenceRuledOut()).toEqual(["spoolio:real-1"]);
  } finally {
    localStorage.clear();
    sessionStorage.clear();
  }
});
