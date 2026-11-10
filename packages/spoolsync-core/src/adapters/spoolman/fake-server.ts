import type { SpoolmanFilament, SpoolmanSpool, SpoolmanVendor } from "./schema";

/**
 * An in-memory Spoolman for tests: just enough of REST v1 for the client, including Spoolman's
 * habit of replacing the whole `extra` map on PATCH and rejecting unregistered extra keys.
 */
export function createFakeSpoolman(
  seed: {
    vendors?: SpoolmanVendor[];
    filaments?: SpoolmanFilament[];
    spools?: SpoolmanSpool[];
    /** The body of `GET /info`; without it the route does not exist. */
    info?: object;
  } = {},
) {
  const vendors = new Map((seed.vendors ?? []).map((v) => [v.id, v]));
  const filaments = new Map((seed.filaments ?? []).map((f) => [f.id, f]));
  const spools = new Map((seed.spools ?? []).map((s) => [s.id, s]));
  const fields: Record<string, Set<string>> = {
    vendor: new Set(),
    filament: new Set(),
    spool: new Set(),
  };
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  let nextId = 1000;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const page = <T>(items: T[], url: URL) => {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? items.length);
    return json(items.slice(offset, offset + limit));
  };
  const checkExtra = (entity: string, extra: Record<string, string> | undefined) =>
    Object.keys(extra ?? {}).find((key) => !fields[entity]!.has(key));

  const withVendor = (
    filament: SpoolmanFilament & { vendor_id?: number | null },
  ): SpoolmanFilament => {
    const { vendor_id, ...rest } = filament;
    const vendorId = vendor_id !== undefined ? vendor_id : filament.vendor?.id;
    return {
      ...rest,
      vendor: vendorId != null ? (vendors.get(vendorId) ?? null) : null,
    };
  };

  const invalid = (field: string, rule: string) =>
    json({ message: `${field}: input should be ${rule}` }, 422);
  /** Like upstream's pydantic models: filament weight is gt=0, spool weights are ge=0. */
  const checkWeights = (entity: "filament" | "spool", body: Record<string, unknown>) => {
    const check = (field: string, ok: (n: number) => boolean, rule: string) => {
      const value = body[field];
      if (typeof value === "number" && !ok(value)) return invalid(field, rule);
      return undefined;
    };
    if (entity === "filament")
      return (
        check("weight", (n) => n > 0, "greater than 0") ??
        check("spool_weight", (n) => n >= 0, "greater than or equal to 0")
      );
    return (
      check("initial_weight", (n) => n >= 0, "greater than or equal to 0") ??
      check("remaining_weight", (n) => n >= 0, "greater than or equal to 0") ??
      check("used_weight", (n) => n >= 0, "greater than or equal to 0") ??
      check("spool_weight", (n) => n >= 0, "greater than or equal to 0")
    );
  };
  /** Spoolman stores the used weight; the remaining weight a response shows is derived from it. */
  const withRemaining = (spool: SpoolmanSpool, initial: number | null | undefined) => {
    const base = initial ?? spool.filament.weight ?? null;
    const used = spool.used_weight ?? 0;
    return {
      ...spool,
      used_weight: used,
      remaining_weight: base === null ? null : Math.max(base - used, 0),
    } as SpoolmanSpool;
  };
  const usedOf = (spool: SpoolmanSpool) => {
    if (spool.used_weight !== undefined) return spool.used_weight;
    const initial = spool.initial_weight ?? spool.filament.weight;
    return initial != null && spool.remaining_weight != null
      ? Math.max(initial - spool.remaining_weight, 0)
      : 0;
  };

  async function fetchImpl(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, ...(body !== undefined ? { body } : {}) });
    const [, entity, id] = path.split("/");

    if (entity === "field" && id) {
      const key = path.split("/")[3];
      if (method === "GET") return json([...fields[id]!].map((k) => ({ key: k })));
      fields[id]!.add(decodeURIComponent(key!));
      return json([]);
    }
    if (method === "GET" && path === "/info" && seed.info) return json(seed.info);
    if (method === "GET" && path === "/vendor") return page([...vendors.values()], url);
    if (method === "GET" && path === "/filament") return page([...filaments.values()], url);
    if (method === "GET" && path === "/spool") return page([...spools.values()], url);
    if (method === "POST" && path === "/vendor") {
      const vendor = { id: nextId++, ...body } as SpoolmanVendor;
      vendors.set(vendor.id, vendor);
      return json(vendor);
    }
    if (
      (method === "POST" && path === "/filament") ||
      (method === "PATCH" && entity === "filament")
    ) {
      const bad = checkWeights("filament", body);
      if (bad) return bad;
    }
    if (method === "POST" && path === "/filament") {
      const filament = withVendor({ id: nextId++, ...body });
      filaments.set(filament.id, filament);
      return json(filament);
    }
    if (method === "PATCH" && entity === "filament") {
      const current = filaments.get(Number(id))!;
      const updated = withVendor({ ...current, ...body });
      filaments.set(updated.id, updated);
      for (const spool of spools.values())
        if (spool.filament.id === updated.id) spool.filament = updated;
      return json(updated);
    }
    if (method === "POST" && path === "/spool") {
      const unknown = checkExtra("spool", body.extra);
      if (unknown) return json({ message: `Unknown extra field ${unknown}` }, 400);
      const bad = checkWeights("spool", body);
      if (bad) return bad;
      const { filament_id, remaining_weight, used_weight, ...rest } = body;
      const parent = filaments.get(filament_id)!;
      const initial: number | null = rest.initial_weight ?? parent.weight ?? null;
      let used = used_weight as number | undefined;
      if (used === undefined) {
        if (remaining_weight != null) {
          if (!initial)
            return json(
              {
                message:
                  "remaining_weight can only be used if the initial_weight is defined or the filament has a weight set.",
              },
              400,
            );
          used = Math.max(initial - remaining_weight, 0);
        } else used = 0;
      }
      const spool = withRemaining(
        {
          id: nextId++,
          registered: "2026-10-15T00:00:00Z",
          archived: false,
          ...rest,
          initial_weight: initial,
          used_weight: used,
          filament: parent,
        } as SpoolmanSpool,
        initial,
      );
      spools.set(spool.id, spool);
      return json(spool);
    }
    if (method === "PATCH" && entity === "spool") {
      const unknown = checkExtra("spool", body.extra);
      if (unknown) return json({ message: `Unknown extra field ${unknown}` }, 400);
      const bad = checkWeights("spool", body);
      if (bad) return bad;
      const current = spools.get(Number(id))!;
      const { filament_id, extra, remaining_weight, ...rest } = body;
      // Like Spoolman, apply the fields in their declaration order (filament_id, initial_weight,
      // remaining_weight), whatever the JSON key order. The used weight is what is stored: a new
      // initial weight alone moves what is left, and a remaining weight becomes
      // max(initial - remaining, 0), which is always 0 for an initial weight of 0.
      let initial: number | null | undefined = current.initial_weight;
      let used = usedOf(current);
      let parent = current.filament;
      if (filament_id !== undefined) {
        parent = filaments.get(filament_id)!;
        if (initial == null && parent.weight != null) initial = parent.weight;
      }
      if ("initial_weight" in body) initial = body.initial_weight as number | null;
      if ("remaining_weight" in body) {
        if (initial == null)
          return json(
            { message: "remaining_weight can only be used if initial_weight is set." },
            400,
          );
        if (remaining_weight == null)
          return json({ message: "remaining_weight cannot be null." }, 500);
        used = Math.max(initial - remaining_weight, 0);
      }
      if ("used_weight" in body) used = body.used_weight as number;
      // `extra` is merged per key and only a null value clears one.
      const merged: Record<string, string> = { ...current.extra };
      for (const [key, value] of Object.entries((extra ?? {}) as Record<string, string | null>)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      const updated = withRemaining(
        {
          ...current,
          ...rest,
          initial_weight: initial,
          used_weight: used,
          ...(extra !== undefined ? { extra: merged } : {}),
          filament: parent,
        } as SpoolmanSpool,
        initial,
      );
      spools.set(updated.id, updated);
      return json(updated);
    }
    return json({ message: "not found" }, 404);
  }

  return { fetchImpl, vendors, filaments, spools, fields, requests };
}
