import { expect, test } from "bun:test";

import { applyAndReloadFiladex, applyAndReloadFilamentDb } from "../../apply";
import type { PlannedChange } from "../../core/compare";
import { loadFilamentDb } from "../filamentdb";
import { loadFiladex } from "./index";

const BASE = "http://test.local";

/** An in-process server: requests go straight to the handler, no sockets or abort signals. */
function serve(handler: (request: Request) => Response | Promise<Response>): {
  baseUrl: string;
  fetchImpl: typeof fetch;
} {
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const { signal: _signal, ...rest } = init ?? {};
    return Promise.resolve(handler(new Request(input, rest)));
  }) as typeof fetch;
  return { baseUrl: BASE, fetchImpl };
}

test("FilamentDB loads over the API and applies updates and creations", async () => {
  const store = new Map<string, Record<string, unknown>>([
    [
      "s1",
      {
        serial: "s1",
        brand: "A",
        type: "PLA",
        color: "Red",
        weightTotal: 1000,
        weightRemaining: 900,
      },
    ],
  ]);
  const auth: Array<string | null> = [];
  const { baseUrl, fetchImpl } = serve(async (request) => {
    auth.push(request.headers.get("authorization"));
    if (request.method === "POST") {
      const spool = (await request.json()) as Record<string, unknown>;
      store.set(String(spool["serial"]), spool);
      return Response.json(spool);
    }
    return Response.json([...store.values()]);
  });
  const connection = { baseUrl: `${baseUrl}/`, token: "tok", fetchImpl };
  const loaded = await loadFilamentDb(connection);
  expect(loaded.origin).toBe("api");
  expect(loaded.spools).toHaveLength(1);

  const update = {
    kind: "update",
    source: "filamentdb",
    groupId: "g1",
    spool: loaded.spools[0]!,
    links: {},
    changes: [{ field: "remainingWeight", from: 900, to: 400 }],
  } as unknown as PlannedChange;
  const create = {
    kind: "create",
    source: "filamentdb",
    groupId: "g2",
    links: {},
    groupIds: {},
    values: {
      vendor: "B",
      material: "PETG",
      name: "Blue",
      colors: ["0000FF"],
      diameter: null,
      density: null,
      nozzleTempMin: null,
      nozzleTempMax: null,
      bedTempMin: null,
      bedTempMax: null,
      upc: null,
      initialWeight: 1000,
      remainingWeight: 1000,
      emptySpoolWeight: null,
      location: null,
      price: null,
      purchasedOn: null,
      lotNr: null,
      comment: null,
      archived: false,
    },
  } as unknown as PlannedChange;

  const result = await applyAndReloadFilamentDb(connection, [update, create]);
  expect(result.log.map((entry) => entry.ok)).toEqual([true, true]);
  expect(store.get("s1")).toMatchObject({ weightRemaining: 400, brand: "A" });
  expect(store.size).toBe(2);
  expect(result.inventory.spools).toHaveLength(2);
  expect(auth.every((value) => value === "Bearer tok")).toBe(true);
});

test("Filadex logs in, patches only moved fields, and creates unique names", async () => {
  const filaments: Array<Record<string, unknown>> = [
    {
      id: 3,
      name: "Prusament PLA Black",
      manufacturer: "Prusament",
      material: "PLA",
      colorName: "Black",
      colorCode: "#000000",
      totalWeight: "1",
      remainingPercentage: "100",
    },
  ];
  const patches: Array<Record<string, unknown>> = [];
  const posts: Array<Record<string, unknown>> = [];
  const { baseUrl, fetchImpl } = serve(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/login") {
      const body = (await request.json()) as { password: string };
      if (body.password !== "pw") return Response.json({ message: "bad" }, { status: 401 });
      return new Response("{}", { headers: { "Set-Cookie": "token=abc; HttpOnly; Path=/" } });
    }
    if (request.headers.get("cookie") !== "token=abc")
      return Response.json({ message: "Authentication required" }, { status: 401 });
    if (request.method === "PATCH") {
      patches.push((await request.json()) as Record<string, unknown>);
      return Response.json({});
    }
    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      posts.push(body);
      filaments.push({ id: 4, ...body });
      return Response.json({ id: 4 }, { status: 201 });
    }
    return Response.json(filaments);
  });
  const connection = { baseUrl, username: "me", password: "pw", fetchImpl };
  const loaded = await loadFiladex(connection);
  expect(loaded.spools[0]).toMatchObject({ sourceId: "3", initialWeight: 1000 });

  const update = {
    kind: "update",
    source: "filadex",
    groupId: "g1",
    spool: loaded.spools[0]!,
    links: {},
    changes: [{ field: "remainingWeight", from: 1000, to: 500 }],
  } as unknown as PlannedChange;
  const create = {
    kind: "create",
    source: "filadex",
    groupId: "g2",
    links: {},
    groupIds: {},
    values: {
      vendor: "Prusament",
      material: "PLA",
      name: "Black",
      colors: ["000000"],
      diameter: 1.75,
      density: null,
      nozzleTempMin: 200,
      nozzleTempMax: 220,
      bedTempMin: null,
      bedTempMax: null,
      upc: null,
      initialWeight: 1000,
      remainingWeight: 250,
      emptySpoolWeight: null,
      location: null,
      price: null,
      purchasedOn: null,
      lotNr: null,
      comment: null,
      archived: false,
    },
  } as unknown as PlannedChange;

  const result = await applyAndReloadFiladex(connection, [update, create]);
  expect(result.log.map((entry) => entry.ok)).toEqual([true, true]);
  expect(patches).toEqual([{ remainingPercentage: "50" }]);
  expect(posts[0]).toMatchObject({
    name: "Prusament PLA Black (2)",
    remainingPercentage: "25",
    printTemp: "200-220",
  });
  expect(posts[0]).not.toHaveProperty("status");
  expect(result.inventory.spools).toHaveLength(2);
});

test("Filadex reports a rejected password", async () => {
  const { baseUrl, fetchImpl } = serve(() => Response.json({ message: "no" }, { status: 401 }));
  await expect(loadFiladex({ baseUrl, username: "me", password: "x", fetchImpl })).rejects.toThrow(
    /username or password/,
  );
});
