import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { refreshSession, signIn } from "./auth";
import { applyToTigertagCloud, loadTigertagCloud, TigertagCloud } from "./cloud";
import { googleError } from "./cloud-errors";
import { encodeLike, structuralEqual } from "./firestore";

const session = {
  uid: "u1",
  email: "me@example.com",
  idToken: "t0",
  refreshToken: "r0",
  expiresAt: Date.now() + 3_600_000,
};

const typedFields = {
  uid: { stringValue: "04AA" },
  weight_available: { integerValue: "870" },
  big: { integerValue: "9007199254740993" },
  stamp: { timestampValue: "2024-01-02T03:04:05.000Z" },
  ref: { referenceValue: "projects/p/databases/(default)/documents/x/y" },
};

function fakeFirestore(patchStatus = 200) {
  const patches: Array<{ query: URLSearchParams; body: { fields: Record<string, unknown> } }> = [];
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (init.method === "PATCH") {
      patches.push({ query: url.searchParams, body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify(
          patchStatus === 200
            ? { updateTime: "2024-02-02T00:00:00.000000Z" }
            : {
                error: { status: "NOT_FOUND", message: "No document to update: projects/secret/x" },
              },
        ),
        { status: patchStatus },
      );
    }
    return new Response(
      JSON.stringify({
        documents: [
          {
            name: "projects/p/databases/(default)/documents/users/u1/inventory/docA",
            updateTime: "2024-01-05T00:00:00.000000Z",
            fields: typedFields,
          },
        ],
      }),
    );
  };
  return { fetchImpl, patches };
}

describe("optimistic concurrency", () => {
  test("sends the loaded updateTime as a precondition", async () => {
    const { fetchImpl, patches } = fakeFirestore();
    const cloud = new TigertagCloud(session, () => {}, fetchImpl);
    await cloud.listInventory();
    await cloud.writeDocument("docA", { weight_available: 5 });
    expect(patches[0]!.query.get("currentDocument.updateTime")).toBe("2024-01-05T00:00:00.000000Z");
    expect(patches[0]!.query.get("currentDocument.exists")).toBeNull();
    // The saved version becomes the next precondition.
    await cloud.writeDocument("docA", { weight_available: 6 });
    expect(patches[1]!.query.get("currentDocument.updateTime")).toBe("2024-02-02T00:00:00.000000Z");
  });

  test("reports a failed precondition as a reload conflict", async () => {
    const { fetchImpl } = fakeFirestore(404);
    const cloud = new TigertagCloud(session, () => {}, fetchImpl);
    await cloud.listInventory();
    await rejects(cloud.writeDocument("docA", { weight_available: 5 }), {
      code: "CONFLICT",
      message: /changed since it was loaded.*Reload/,
    });
  });

  test("409 ABORTED and 400 FAILED_PRECONDITION are reload conflicts", async () => {
    const failing = (status: number, google: string) => async (input: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response(
            JSON.stringify({
              error: { status: google, message: "Precondition at projects/secret/x" },
            }),
            { status },
          )
        : fakeFirestore().fetchImpl(input, init);
    for (const [status, google] of [
      [409, "ABORTED"],
      [400, "FAILED_PRECONDITION"],
    ] as const) {
      const cloud = new TigertagCloud(session, () => {}, failing(status, google));
      await cloud.listInventory();
      await rejects(cloud.writeDocument("docA", { weight_available: 5 }), {
        code: "CONFLICT",
        message: /changed since it was loaded.*Reload/,
      });
      await rejects(cloud.writeDocument("docB", { weight_available: 5 }, { create: true }), {
        code: "CONFLICT",
        message: /already exists/,
      });
    }
  });

  test("preserves typed values it does not change", async () => {
    const { fetchImpl, patches } = fakeFirestore();
    const cloud = new TigertagCloud(session, () => {}, fetchImpl);
    const [record] = await cloud.listInventory();
    await cloud.writeDocument("docA", {
      big: record!["big"],
      stamp: record!["stamp"],
      ref: record!["ref"],
      weight_available: 5,
    });
    expect(patches[0]!.body.fields).toEqual({
      ...typedFields,
      weight_available: { integerValue: "5" },
      uid: undefined,
    });
  });
});

describe("firestore helpers", () => {
  test("structuralEqual ignores key order", () => {
    expect(structuralEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(structuralEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(structuralEqual([1, 2], [2, 1])).toBe(false);
  });

  test("encodeLike keeps unchanged map members typed and re-types timestamps", () => {
    const original = {
      mapValue: { fields: { t: typedFields.stamp, n: { integerValue: "1" } } },
    };
    expect(encodeLike({ n: 2, t: Date.parse("2024-01-02T03:04:05.000Z") }, original)).toEqual({
      mapValue: { fields: { n: { integerValue: "2" }, t: typedFields.stamp } },
    });
    expect(encodeLike(0, typedFields.stamp)).toEqual({
      timestampValue: "1970-01-01T00:00:00.000Z",
    });
  });
});

describe("auth expiry", () => {
  const respond = (body: unknown) => async () => new Response(JSON.stringify(body));

  test("missing expiry means refresh right away", async () => {
    const signed = await signIn(
      "a@b.c",
      "pw",
      respond({ localId: "u1", email: "a@b.c", idToken: "i", refreshToken: "r" }),
    );
    expect(Number.isNaN(signed.expiresAt)).toBe(false);
    expect(signed.expiresAt).toBeLessThanOrEqual(Date.now());
  });

  test("refresh keeps the existing uid without user_id", async () => {
    const fresh = await refreshSession(
      session,
      respond({ id_token: "i2", refresh_token: "r2", expires_in: "bad" }),
    );
    expect(fresh.uid).toBe("u1");
    expect(fresh.expiresAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("googleError", () => {
  test("maps 404 and 409 to friendly text without project paths", async () => {
    for (const status of [404, 409]) {
      const error = await googleError(
        new Response(JSON.stringify({ error: { message: "Document projects/secret/x missing" } }), {
          status,
        }),
      );
      expect(error.message).not.toContain("secret");
      expect(error.message).toContain("Reload");
      expect(error.code).not.toBe("Document");
    }
  });
});

describe("injected runtime", () => {
  const runtime = { now: () => 1_800_000_000_000, randomUUID: () => "a-b-c" };

  test("load and create use the runtime clock", async () => {
    const loaded = await loadTigertagCloud({ uid: "u1", listInventory: async () => [] }, runtime);
    expect(loaded.loadedAt).toBe(new Date(1_800_000_000_000).toISOString());

    const written: Array<{ id: string; fields: Record<string, unknown> }> = [];
    const extra = makeSpool("spoolman", "77", {
      crossIds: { spoolmanId: 77 },
      vendor: "Elegoo",
      material: "PETG",
      colors: ["FF0000"],
    });
    const { groups } = matchSpools([extra]);
    const plan = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["tigertag"] }]]),
    );
    await applyToTigertagCloud(
      {
        async writeDocument(id, fields) {
          written.push({ id, fields });
        },
      },
      plan.get("tigertag")!,
      undefined,
      runtime,
    );
    expect(written[0]!.id).toBe("TigerData_abc");
    expect(written[0]!.fields["last_update"]).toBe(1_800_000_000_000);
    expect(written[0]!.fields["timestamp"]).toBe(1_800_000_000 - 946_684_800);
  });
});
