import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import {
  applyToTigertagCloud,
  decodeFields,
  encodeValue,
  loadTigertagCloud,
  signIn,
  TigertagCloud,
  type TigertagSession,
} from "./cloud";

/** Google sign-in, token refresh and a Firestore inventory, in memory. */
function fakeGoogle(docs: Record<string, Record<string, unknown>>) {
  const writes: Array<{
    docId: string;
    mask: string[];
    exists: string | null;
    fields: Record<string, unknown>;
  }> = [];
  let tokenNumber = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.hostname === "identitytoolkit.googleapis.com") {
      const body = JSON.parse(String(init.body));
      if (body.password !== "right")
        return json({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, 400);
      return json({
        localId: "u1",
        email: body.email,
        idToken: "t0",
        refreshToken: "r0",
        expiresIn: "3600",
      });
    }
    if (url.hostname === "securetoken.googleapis.com") {
      tokenNumber++;
      return json({
        id_token: `t${tokenNumber}`,
        refresh_token: `r${tokenNumber}`,
        user_id: "u1",
        expires_in: "3600",
      });
    }
    const auth = new Headers(init.headers).get("authorization");
    if (auth === "Bearer expired") return json({ error: { status: "UNAUTHENTICATED" } }, 401);
    const path = decodeURIComponent(url.pathname);
    if (!path.includes("/documents/users/u1/inventory"))
      return json({ error: { status: "PERMISSION_DENIED" } }, 403);
    if (init.method === "PATCH") {
      const docId = path.split("/").at(-1)!;
      const fields = decodeFields(JSON.parse(String(init.body)).fields);
      writes.push({
        docId,
        mask: url.searchParams.getAll("updateMask.fieldPaths"),
        exists: url.searchParams.get("currentDocument.exists"),
        fields,
      });
      return json({});
    }
    // Two pages, to exercise pageToken.
    const ids = Object.keys(docs);
    const page = url.searchParams.get("pageToken") ? ids.slice(1) : ids.slice(0, 1);
    return json({
      documents: page.map((id) => ({
        name: `projects/p/databases/(default)/documents/users/u1/inventory/${id}`,
        fields: (encodeValue(docs[id]) as { mapValue: { fields: unknown } }).mapValue.fields,
      })),
      ...(url.searchParams.get("pageToken") ? {} : { nextPageToken: "next" }),
    });
  };
  return { fetchImpl, writes };
}

const twinA = {
  uid: "04AA",
  id_type: 142,
  id_brand: 15962,
  id_material: 38219,
  color_r: 0,
  color_g: 0,
  color_b: 0,
  color_a: 255,
  measure_gr: 1000,
  weight_available: 870,
  data1: 56,
  twin_tag_uid: "04BB",
  updatedAt: 5,
};
const twinB = { ...twinA, uid: "04BB", twin_tag_uid: "04AA" };

const session = (overrides: Partial<TigertagSession> = {}): TigertagSession => ({
  uid: "u1",
  email: "me@example.com",
  idToken: "t0",
  refreshToken: "r0",
  expiresAt: Date.now() + 3_600_000,
  ...overrides,
});

test("TigerTag stops when cloud pagination repeats a token", async () => {
  let requests = 0;
  const cloud = new TigertagCloud(
    session(),
    () => {},
    async () => {
      requests++;
      if (requests > 2) throw new Error("Pagination should have stopped already");
      return new Response(JSON.stringify({ documents: [], nextPageToken: "repeated" }));
    },
  );
  await rejects(cloud.listInventory(), { code: "INVALID_RESPONSE" });
  expect(requests).toBe(2);
});

test("concurrent TigerTag requests share one session refresh", async () => {
  const { fetchImpl } = fakeGoogle({});
  let refreshes = 0;
  let notifications = 0;
  const cloud = new TigertagCloud(
    session({ expiresAt: 0 }),
    () => {
      notifications++;
    },
    async (input, init) => {
      if (new URL(input).hostname === "securetoken.googleapis.com") refreshes++;
      return fetchImpl(input, init);
    },
  );
  expect(await Promise.all([cloud.listInventory(), cloud.listInventory()])).toEqual([[], []]);
  expect(refreshes).toBe(1);
  expect(notifications).toBe(1);
});

test("failed TigerTag refresh does not prevent a subsequent retry", async () => {
  const { fetchImpl } = fakeGoogle({});
  let attempts = 0;
  const cloud = new TigertagCloud(
    session({ expiresAt: 0 }),
    () => {},
    async (input, init) => {
      if (new URL(input).hostname === "securetoken.googleapis.com" && attempts++ === 0)
        throw new Error("temporary refresh failure");
      return fetchImpl(input, init);
    },
  );
  await rejects(cloud.listInventory(), { message: "temporary refresh failure" });
  expect(await cloud.listInventory()).toEqual([]);
  expect(attempts).toBe(2);
});

test("a late unauthorized response does not invalidate a newer TigerTag token", async () => {
  const { fetchImpl } = fakeGoogle({});
  let refreshes = 0;
  let staleRequests = 0;
  let release!: () => void;
  const refreshedRequest = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cloud = new TigertagCloud(
    session({ idToken: "expired" }),
    () => {},
    async (input, init) => {
      const url = new URL(input);
      if (url.hostname === "securetoken.googleapis.com") refreshes++;
      if (url.hostname === "firestore.googleapis.com") {
        const token = new Headers(init?.headers).get("authorization");
        if (token === "Bearer expired" && ++staleRequests === 2) await refreshedRequest;
        else if (token !== "Bearer expired") release();
      }
      return fetchImpl(input, init);
    },
  );
  expect(await Promise.all([cloud.listInventory(), cloud.listInventory()])).toEqual([[], []]);
  expect(refreshes).toBe(1);
});

test("TigerTag rejects repeated document identities across pages", async () => {
  let requests = 0;
  const cloud = new TigertagCloud(
    session(),
    () => {},
    async () => {
      requests++;
      return new Response(
        JSON.stringify({
          documents: [
            {
              name: "projects/p/databases/(default)/documents/users/u1/inventory/duplicate",
              fields: {},
            },
          ],
          ...(requests === 1 ? { nextPageToken: "next" } : {}),
        }),
      );
    },
  );
  await rejects(cloud.listInventory(), { code: "INVALID_RESPONSE" });
  expect(requests).toBe(2);
});

describe("firestore values", () => {
  test("round-trip through Firestore's typed JSON", () => {
    const value = { a: 1, b: 1.5, c: "x", d: true, e: null, f: [1, "y"], g: { h: 2 } };
    expect(
      decodeFields(
        (encodeValue(value) as { mapValue: { fields: Record<string, never> } }).mapValue.fields,
      ),
    ).toEqual(value);
    expect(encodeValue(450)).toEqual({ integerValue: "450" });
  });
});

describe("signIn", () => {
  test("returns a session, or a readable error", async () => {
    const { fetchImpl } = fakeGoogle({});
    expect(await signIn("me@example.com", "right", fetchImpl)).toMatchObject({
      uid: "u1",
      idToken: "t0",
      refreshToken: "r0",
    });
    await rejects(signIn("me@example.com", "wrong", fetchImpl), {
      message: "Wrong email or password.",
    });
  });
});

describe("TigertagCloud", () => {
  test("lists every page and pairs twins", async () => {
    const { fetchImpl } = fakeGoogle({ docA: twinA, docB: twinB });
    const result = await loadTigertagCloud(new TigertagCloud(session(), () => {}, fetchImpl));
    expect(result).toMatchObject({ origin: "api", file: { exportedBy: "u1" } });
    expect(result.spools).toHaveLength(1);
    expect(result.spools[0]).toMatchObject({ vendor: "Anycubic", remainingWeight: 870 });
  });

  test("refreshes an expired token and reports the new session", async () => {
    const { fetchImpl } = fakeGoogle({ docA: twinA });
    const seen: TigertagSession[] = [];
    await new TigertagCloud(
      session({ expiresAt: 0 }),
      (s) => seen.push(s),
      fetchImpl,
    ).listInventory();
    expect(seen[0]).toMatchObject({ idToken: "t1", refreshToken: "r1" });
  });

  test("retries once after a 401", async () => {
    const { fetchImpl } = fakeGoogle({ docA: twinA });
    const records = await new TigertagCloud(
      session({ idToken: "expired" }),
      () => {},
      fetchImpl,
    ).listInventory();
    expect(records).toHaveLength(1);
  });

  test("applies only changed fields, to both twin documents, and creates new ones", async () => {
    const { fetchImpl, writes } = fakeGoogle({ docA: twinA, docB: twinB });
    const cloud = new TigertagCloud(session(), () => {}, fetchImpl);
    const loaded = await loadTigertagCloud(cloud);
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51, tigertagUid: "04AA" },
      vendor: "Anycubic",
      material: "PLA",
      colors: ["000000"],
      remainingWeight: 700,
      initialWeight: 1000,
      name: null,
    });
    const extra = makeSpool("spoolman", "77", {
      crossIds: { spoolmanId: 77 },
      vendor: "Elegoo",
      material: "PETG",
      colors: ["FF0000"],
    });
    const { groups } = matchSpools([...loaded.spools, spoolman, extra]);
    const linked = groups.find((g) => g.members.tigertag)!;
    const single = groups.find((g) => g.members.spoolman === extra)!;
    const plan = buildPlan(
      groups,
      new Map([
        [linked.id, { values: { remainingWeight: 700 }, createIn: [] }],
        [single.id, { values: {}, createIn: ["tigertag"] }],
      ]),
    );

    const log = await applyToTigertagCloud(cloud, plan.get("tigertag")!);
    expect(log.every((entry) => entry.ok)).toBe(true);
    const [a, b, created] = writes;
    for (const [write, docId] of [
      [a, "docA"],
      [b, "docB"],
    ] as const) {
      expect(write).toMatchObject({
        docId,
        exists: "true",
        mask: ["weight_available", "spoolmanId", "last_update"],
      });
      expect(write!.fields).toMatchObject({ weight_available: 700, spoolmanId: 51 });
    }
    expect(created).toMatchObject({
      exists: "false",
      fields: { id_type: 142, brand: "Elegoo", spoolmanId: 77 },
    });
    expect(created!.docId).toMatch(/^TigerData_/);
  });
});
