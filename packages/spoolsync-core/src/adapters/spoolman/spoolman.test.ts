import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import {
  isLocalHostname,
  needsLocalNetworkFlag,
  normalizeBaseUrl,
  SpoolmanClient,
  SpoolmanError,
} from "./client";
import { diagnoseConnection } from "./diagnose";
import { spoolmanToCommon } from "./map";
import type { SpoolmanSpool } from "./schema";

type Call = { url: string; init: RequestInit & { targetAddressSpace?: string } };

function fakeFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    calls.push({ url: input, init });
    return handler(new URL(input), init);
  };
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function spool(id: number, overrides: Partial<SpoolmanSpool> = {}): SpoolmanSpool {
  return {
    id,
    registered: "2026-01-01T00:00:00Z",
    filament: {
      id: 10,
      name: "Galaxy Black",
      material: "PLA",
      density: 1.24,
      diameter: 1.75,
      weight: 1000,
      color_hex: "1a1a1a",
      vendor: { id: 3, name: "Prusament", empty_spool_weight: 193 },
    },
    remaining_weight: 640,
    initial_weight: 1000,
    used_weight: 360,
    archived: false,
    ...overrides,
  };
}

describe("normalizeBaseUrl", () => {
  test("adds http:// to a bare host and strips /api/v1 and slashes", () => {
    expect(normalizeBaseUrl("spoolman.local:7912").toString()).toBe("http://spoolman.local:7912/");
    expect(normalizeBaseUrl(" http://10.0.0.5:7912/api/v1/ ").toString()).toBe(
      "http://10.0.0.5:7912/",
    );
  });

  test("keeps a reverse-proxy path prefix", () => {
    expect(normalizeBaseUrl("https://home.example/spoolman/").pathname).toBe("/spoolman");
  });

  test("refuses credentials and other schemes", () => {
    expect(() => normalizeBaseUrl("http://user:pw@host")).toThrow(SpoolmanError);
    expect(() => normalizeBaseUrl("ftp://host")).toThrow(/http/);
  });
});

describe("needsLocalNetworkFlag", () => {
  test("only for plain http from an https page, and never for loopback", () => {
    expect(needsLocalNetworkFlag(new URL("http://192.168.1.2:7912"), "https:")).toBe(true);
    expect(needsLocalNetworkFlag(new URL("http://spoolman.local"), "https:")).toBe(true);
    expect(needsLocalNetworkFlag(new URL("https://spoolman.example"), "https:")).toBe(false);
    expect(needsLocalNetworkFlag(new URL("http://192.168.1.2"), "http:")).toBe(false);
    expect(needsLocalNetworkFlag(new URL("http://localhost:7912"), "https:")).toBe(false);
    expect(needsLocalNetworkFlag(new URL("http://127.0.0.1:7912"), "https:")).toBe(false);
  });
});

describe("isLocalHostname", () => {
  test("recognises home-network and loopback hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.20",
      "spoolman.local",
      "[fd12:3456::1]",
    ]) {
      expect(isLocalHostname(host)).toBe(true);
    }
    for (const host of ["spoolsync.example", "172.32.0.1", "8.8.8.8", "spoolman.example.com"]) {
      expect(isLocalHostname(host)).toBe(false);
    }
  });
});

describe("SpoolmanClient", () => {
  test("pages through every spool, archived included", async () => {
    const all = Array.from({ length: 1500 }, (_, i) => spool(i + 1));
    const { calls, fetchImpl } = fakeFetch((url) => {
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return json(all.slice(offset, offset + limit));
    });
    const client = new SpoolmanClient({ baseUrl: "http://10.0.0.5:7912" }, fetchImpl, "https:");
    const spools = await client.listSpools();
    expect(spools).toHaveLength(1500);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(
      "http://10.0.0.5:7912/api/v1/spool?sort=id%3Aasc&allow_archived=true&limit=1000&offset=0",
    );
  });

  describe("paging with X-Total-Count", () => {
    const withTotal = (body: unknown, total: number | string) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", "x-total-count": String(total) },
      });
    const pager = (all: SpoolmanSpool[], total: number | string = all.length) =>
      fakeFetch((url) => {
        const offset = Number(url.searchParams.get("offset"));
        const limit = Number(url.searchParams.get("limit"));
        return withTotal(all.slice(offset, offset + limit), total);
      });
    const offsetsOf = (calls: Call[]) =>
      calls
        .map((call) => Number(new URL(call.url).searchParams.get("offset")))
        .sort((a, b) => a - b);

    test("requests the remaining pages together and keeps them in order", async () => {
      const all = Array.from({ length: 4500 }, (_, i) => spool(i + 1));
      const { calls, fetchImpl } = pager(all);
      const client = new SpoolmanClient({ baseUrl: "http://10.0.0.5:7912" }, fetchImpl, "https:");
      const spools = await client.listSpools();
      expect(spools.map((item) => item.id)).toEqual(all.map((item) => item.id));
      expect(offsetsOf(calls)).toEqual([0, 1000, 2000, 3000, 4000]);
    });

    test("a total on a page boundary still confirms the end with one empty page", async () => {
      const exact = pager(Array.from({ length: 2000 }, (_, i) => spool(i + 1)));
      const spools = await new SpoolmanClient(
        { baseUrl: "http://h" },
        exact.fetchImpl,
        "http:",
      ).listSpools();
      expect(spools).toHaveLength(2000);
      expect(offsetsOf(exact.calls)).toEqual([0, 1000, 2000]);
    });

    test("pages one at a time when the total is missing or unusable", async () => {
      const all = Array.from({ length: 2500 }, (_, i) => spool(i + 1));
      const none = fakeFetch((url) => {
        const offset = Number(url.searchParams.get("offset"));
        return json(all.slice(offset, offset + 1000));
      });
      expect(
        await new SpoolmanClient({ baseUrl: "http://h" }, none.fetchImpl, "http:").listSpools(),
      ).toHaveLength(2500);
      expect(none.calls.map((call) => new URL(call.url).searchParams.get("offset"))).toEqual([
        "0",
        "1000",
        "2000",
      ]);
      const junk = pager(all, "lots");
      expect(
        await new SpoolmanClient({ baseUrl: "http://h" }, junk.fetchImpl, "http:").listSpools(),
      ).toHaveLength(2500);
      expect(junk.calls).toHaveLength(3);
    });

    test("keeps going when the total undercounts and the last page is full", async () => {
      const all = Array.from({ length: 3200 }, (_, i) => spool(i + 1));
      const { fetchImpl } = pager(all, 2000);
      const spools = await new SpoolmanClient(
        { baseUrl: "http://h" },
        fetchImpl,
        "http:",
      ).listSpools();
      expect(spools).toHaveLength(3200);
    });

    test("stops at the first short page like one-by-one paging", async () => {
      const { fetchImpl } = fakeFetch((url) => {
        const offset = Number(url.searchParams.get("offset"));
        const size = offset === 1000 ? 10 : 1000;
        return withTotal(
          Array.from({ length: size }, (_, i) => spool(offset + i + 1)),
          5000,
        );
      });
      const spools = await new SpoolmanClient(
        { baseUrl: "http://h" },
        fetchImpl,
        "http:",
      ).listSpools();
      expect(spools).toHaveLength(1010);
    });

    test("still rejects duplicate IDs with the same message", async () => {
      const { fetchImpl } = fakeFetch(() =>
        withTotal(
          Array.from({ length: 1000 }, (_, i) => spool(i + 1)),
          3000,
        ),
      );
      await rejects(
        new SpoolmanClient({ baseUrl: "http://h" }, fetchImpl, "http:").listSpools(),
        (error: unknown) =>
          error instanceof SpoolmanError &&
          error.kind === "parse" &&
          error.message.startsWith(
            "Spoolman returned duplicate /spool ID 1 while paging inventory. Reload the inventory;",
          ),
      );
    });

    test("fails with the page's error and cancels the pages still in flight", async () => {
      const aborted: number[] = [];
      const { fetchImpl } = fakeFetch((url, init) => {
        const offset = Number(url.searchParams.get("offset"));
        if (offset === 0)
          return withTotal(
            Array.from({ length: 1000 }, (_, i) => spool(i + 1)),
            4000,
          );
        if (offset === 1000) return json({ detail: "boom" }, 500);
        return new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () => {
            aborted.push(offset);
            reject(new Error("aborted"));
          }),
        );
      });
      await rejects(
        new SpoolmanClient({ baseUrl: "http://h" }, fetchImpl, "http:").listSpools(),
        (error: unknown) => error instanceof SpoolmanError && error.kind === "http",
      );
      expect(aborted.sort()).toEqual([2000, 3000]);
    });
  });

  test("sends the bearer token and the Local Network Access flag", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ version: "0.23.0" }));
    await new SpoolmanClient(
      { baseUrl: "http://10.0.0.5:7912", token: " secret " },
      fetchImpl,
      "https:",
    ).info();
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer secret");
    expect(calls[0]?.init.targetAddressSpace).toBe("local");
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  test("leaves the flag off when the page is http", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ version: "0.23.0" }));
    await new SpoolmanClient({ baseUrl: "http://10.0.0.5:7912" }, fetchImpl, "http:").info();
    expect(calls[0]?.init.targetAddressSpace).toBeUndefined();
  });

  test("sends JSON bodies with a content type", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(spool(4)));
    await new SpoolmanClient({ baseUrl: "http://h" }, fetchImpl, "http:").useSpool(4, {
      weightGrams: 12.5,
    });
    expect(calls[0]?.init.method).toBe("PUT");
    expect(new Headers(calls[0]?.init.headers).get("content-type")).toBe("application/json");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ use_weight: 12.5 }));
  });

  test("turns 401 into an auth error and other statuses into http errors", async () => {
    const unauthorized = fakeFetch(() => json({ detail: "no" }, 401));
    await rejects(
      new SpoolmanClient({ baseUrl: "http://h" }, unauthorized.fetchImpl, "http:").info(),
      {
        kind: "auth",
      },
    );
    const missing = fakeFetch(() => json({ detail: "Not Found" }, 404));
    await rejects(new SpoolmanClient({ baseUrl: "http://h" }, missing.fetchImpl, "http:").info(), {
      kind: "http",
      status: 404,
    });
  });

  test("reports a thrown fetch as a network error", async () => {
    const client = new SpoolmanClient(
      { baseUrl: "http://h" },
      () => Promise.reject(new TypeError("Failed to fetch")),
      "http:",
    );
    await rejects(client.info(), { kind: "network" });
  });

  test("registers only the missing extra fields", async () => {
    const { calls, fetchImpl } = fakeFetch((_url, init) =>
      init.method === "POST" ? json([]) : json([{ key: "spoolstock_short_id" }]),
    );
    const created = await new SpoolmanClient(
      { baseUrl: "http://h" },
      fetchImpl,
      "http:",
    ).ensureExtraFields("spool", {
      spoolstock_short_id: "Spoolstock ID",
      spoolsync_tigertag_uid: "TigerTag UID",
    });
    expect(created).toEqual(["spoolsync_tigertag_uid"]);
    expect(calls.at(-1)?.url).toBe("http://h/api/v1/field/spool/spoolsync_tigertag_uid");
    expect(calls.at(-1)?.init.body).toBe(
      JSON.stringify({ name: "TigerTag UID", field_type: "text" }),
    );
  });
});

describe("spoolmanToCommon", () => {
  test("maps filament, vendor and weights", () => {
    expect(spoolmanToCommon(spool(7))).toMatchObject({
      source: "spoolman",
      sourceId: "7",
      crossIds: { spoolmanId: 7 },
      vendor: "Prusament",
      material: "PLA",
      name: "Galaxy Black",
      colors: ["1A1A1A"],
      initialWeight: 1000,
      remainingWeight: 640,
      emptySpoolWeight: 193,
    });
  });

  test("reads Spoolstock cross-ids from the extra field or the lot number", () => {
    const fromExtra = spoolmanToCommon(
      spool(1, { extra: { spoolstock_short_id: JSON.stringify("abc123") } }),
    );
    expect(fromExtra.crossIds.spoolstockShortId).toBe("abc123");
    const fromLot = spoolmanToCommon(spool(2, { lot_nr: "spoolstock:spool:422070b7" }));
    expect(fromLot.crossIds.spoolstockShortId).toBe("422070b7");
  });

  test("prefers multi-colour hexes and derives remaining weight from used weight", () => {
    const multi = spoolmanToCommon(
      spool(3, {
        remaining_weight: null,
        filament: {
          ...spool(3).filament,
          multi_color_hexes: "ff0000,00FF00",
          multi_color_direction: "coaxial",
        },
      }),
    );
    expect(multi.colors).toEqual(["FF0000", "00FF00"]);
    expect(multi.remainingWeight).toBe(640);
  });
});

describe("diagnoseConnection", () => {
  const env = {
    pageOrigin: "https://spoolsync.example",
    pageProtocol: "https:",
    pageHostname: "spoolsync.example",
    supportsLocalNetworkAccess: true,
    localNetworkPermission: "granted" as const,
  };

  test("reports success with the version and spool count", async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname.endsWith("/info") ? json({ version: "0.23.0" }) : json([spool(1), spool(2)]),
    );
    const result = await diagnoseConnection(
      { baseUrl: "http://10.0.0.5:7912" },
      { ...env, fetchImpl },
    );
    expect(result).toMatchObject({
      code: "ok",
      title: "Connected to Spoolman 0.23.0",
      spoolCount: 2,
    });
  });

  test("blames CORS when a no-cors probe gets through", async () => {
    const { fetchImpl } = fakeFetch((_url, init) => {
      if (init.mode === "no-cors") return new Response(null, { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    const result = await diagnoseConnection(
      { baseUrl: "http://10.0.0.5:7912" },
      { ...env, fetchImpl },
    );
    expect(result.code).toBe("cors");
    expect(result.envLine).toBe("SPOOLMAN_CORS_ORIGIN=https://spoolsync.example");
  });

  test("explains when the browser cannot reach http from https at all", async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const result = await diagnoseConnection(
      { baseUrl: "http://10.0.0.5:7912" },
      { ...env, supportsLocalNetworkAccess: false, localNetworkPermission: "unknown", fetchImpl },
    );
    expect(result.code).toBe("mixed-content-unsupported");
  });

  test("ignores the permission when the page itself is local", async () => {
    const { fetchImpl } = fakeFetch((_url, init) => {
      if (init.mode === "no-cors") return new Response(null, { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    const result = await diagnoseConnection(
      { baseUrl: "http://localhost:7913" },
      {
        ...env,
        pageOrigin: "http://localhost:4321",
        pageProtocol: "http:",
        pageHostname: "localhost",
        localNetworkPermission: "denied",
        fetchImpl,
      },
    );
    expect(result.code).toBe("cors");
  });

  test("points at the permission when local network access was denied", async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const result = await diagnoseConnection(
      { baseUrl: "http://10.0.0.5:7912" },
      { ...env, localNetworkPermission: "denied", fetchImpl },
    );
    expect(result.code).toBe("local-network-denied");
  });

  test("asks for a token on 401", async () => {
    const { fetchImpl } = fakeFetch(() => json({}, 401));
    const result = await diagnoseConnection(
      { baseUrl: "http://10.0.0.5:7912" },
      { ...env, fetchImpl },
    );
    expect(result.code).toBe("auth");
  });
});
