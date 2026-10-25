import { expect, spyOn, test } from "bun:test";

import { createFakeSpoolman } from "./adapters/spoolman/fake-server";
import { ApplyReloadError, applyAndReloadSpoolman } from "./apply";
import { buildPlan } from "./core/compare";
import { matchSpools } from "./core/match";
import { makeSpool } from "./core/testing";

function creationPlan() {
  const group = matchSpools([makeSpool("spoolio", "donor")]).groups[0]!;
  return buildPlan([group], new Map([[group.id, { values: {}, createIn: ["spoolman"] }]])).get(
    "spoolman",
  )!;
}

function mockFetch(implementation: (input: string, init?: RequestInit) => Promise<Response>) {
  const replacement = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      implementation(String(input), init),
    { preconnect: globalThis.fetch.preconnect },
  );
  return spyOn(globalThis, "fetch").mockImplementation(replacement);
}

test("successful apply returns the write log and refreshed inventory", async () => {
  const server = createFakeSpoolman();
  const mocked = mockFetch((input, init) => server.fetchImpl(String(input), init));
  try {
    const result = await applyAndReloadSpoolman(
      { baseUrl: "http://spoolman.test" },
      creationPlan(),
    );
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.ok).toBe(true);
    expect(result.inventory.spools).toHaveLength(1);
  } finally {
    mocked.mockRestore();
  }
});

for (const failWrite of [false, true]) {
  test(`refresh failure preserves ${failWrite ? "failed" : "successful"} write results`, async () => {
    const server = createFakeSpoolman();
    let attemptedWrite = false;
    const mocked = mockFetch(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/spool" && init?.method === "POST") {
        attemptedWrite = true;
        if (failWrite) return new Response("write unavailable", { status: 503 });
      }
      if (attemptedWrite && url.pathname === "/api/v1/spool" && init?.method === "GET")
        return new Response("refresh unavailable", { status: 503 });
      return server.fetchImpl(String(input), init);
    });
    try {
      let failure: unknown;
      try {
        await applyAndReloadSpoolman({ baseUrl: "http://spoolman.test" }, creationPlan());
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(ApplyReloadError);
      const error = failure as ApplyReloadError;
      expect(error.service).toBe("Spoolman");
      expect(error.log).toHaveLength(1);
      expect(error.log[0]?.ok).toBe(!failWrite);
      expect(error.message).toContain("Reload the inventory before retrying writes");
      expect(error.cause).toBeInstanceOf(Error);
      expect(server.spools.size).toBe(failWrite ? 0 : 1);
    } finally {
      mocked.mockRestore();
    }
  });
}
