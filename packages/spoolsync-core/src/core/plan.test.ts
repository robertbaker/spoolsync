import { expect, test } from "bun:test";

import { applyToSpoolman } from "../adapters/spoolman/apply";
import { SpoolmanClient } from "../adapters/spoolman/client";
import { applyToTigertagCloud, TigertagCloud } from "../adapters/tigertag/cloud";
import { buildPlan, type PlannedChange } from "./compare";
import { matchSpools } from "./match";
import { makeSpool } from "./testing";

for (const source of ["spoolman", "tigertag"] as const) {
  test(`${source} rejects invalid batches before making any requests`, async () => {
    let requests = 0;
    const fetchImpl = async () => {
      requests++;
      throw new Error("Unexpected request");
    };
    const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, fetchImpl);
    const cloud = new TigertagCloud(
      {
        uid: "user",
        email: "test@example.com",
        idToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      },
      () => {},
      fetchImpl,
    );
    const apply = (changes: PlannedChange[]) =>
      source === "spoolman"
        ? applyToSpoolman(client, changes)
        : applyToTigertagCloud(cloud, changes);
    const group = matchSpools([makeSpool("spoolio", "donor")]).groups[0]!;
    const create = buildPlan(
      [group],
      new Map([[group.id, { values: {}, createIn: [source] }]]),
    ).get(source)![0]!;
    const foreign: PlannedChange = {
      ...create,
      source: source === "spoolman" ? "tigertag" : "spoolman",
    };
    await expect(apply([create, foreign])).rejects.toThrow("Cannot apply");
    await expect(apply([create, create])).rejects.toThrow("Duplicate creation");
    const wrongSpool: PlannedChange = {
      kind: "update",
      source,
      groupId: "group",
      spool: makeSpool("spoolio", "foreign"),
      changes: [],
      links: {},
    };
    await expect(apply([wrongSpool])).rejects.toThrow("Cannot apply");
    const update: PlannedChange = { ...wrongSpool, spool: makeSpool(source, "1") };
    await expect(apply([update, update])).rejects.toThrow("Duplicate update");
    expect(requests).toBe(0);
  });
}
