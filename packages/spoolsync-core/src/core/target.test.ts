import { expect, test } from "bun:test";

import type { LoadResult } from "./model";
import { snapshotMatchesTarget } from "./target";

test("API snapshots cannot be applied to another server/account or without provenance", () => {
  const snapshot: LoadResult = {
    source: "spoolman",
    origin: "api",
    connectionId: "https://one.test",
    spools: [],
    warnings: [],
    loadedAt: "",
  };
  expect(snapshotMatchesTarget(snapshot, "https://one.test")).toBe(true);
  expect(snapshotMatchesTarget(snapshot, "https://two.test")).toBe(false);
  expect(snapshotMatchesTarget({ ...snapshot, connectionId: undefined }, "https://one.test")).toBe(
    false,
  );
  expect(snapshotMatchesTarget({ ...snapshot, origin: "file" }, undefined)).toBe(true);
});
