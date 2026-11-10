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
      const { filament_id, ...rest } = body;
      const spool = {
        id: nextId++,
        registered: "2026-10-15T00:00:00Z",
        archived: false,
        ...rest,
        filament: filaments.get(filament_id)!,
      } as SpoolmanSpool;
      spools.set(spool.id, spool);
      return json(spool);
    }
    if (method === "PATCH" && entity === "spool") {
      const unknown = checkExtra("spool", body.extra);
      if (unknown) return json({ message: `Unknown extra field ${unknown}` }, 400);
      const current = spools.get(Number(id))!;
      const { filament_id, extra, ...rest } = body;
      // Like Spoolman, walk the body in order: `remaining_weight` needs an initial weight that is
      // already set or was listed (or inherited from a new filament) before it.
      let initial: number | null | undefined = current.initial_weight;
      for (const [key, value] of Object.entries(body)) {
        if (key === "filament_id") {
          const weight = filaments.get(value as number)!.weight;
          if (initial == null && weight != null) {
            initial = weight;
            rest.initial_weight ??= weight;
          }
        } else if (key === "initial_weight") initial = value as number | null;
        else if (key === "remaining_weight" && value != null && initial == null)
          return json(
            {
              message: "remaining_weight can only be used if initial_weight is set.",
            },
            400,
          );
      }
      // Spoolman keeps the used weight, so a new initial weight alone moves what is left.
      if (
        typeof rest.initial_weight === "number" &&
        rest.remaining_weight === undefined &&
        current.initial_weight != null &&
        current.remaining_weight != null
      )
        rest.remaining_weight = Math.max(
          rest.initial_weight - (current.initial_weight - current.remaining_weight),
          0,
        );
      // `extra` is merged per key and only a null value clears one.
      const merged: Record<string, string> = { ...current.extra };
      for (const [key, value] of Object.entries((extra ?? {}) as Record<string, string | null>)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      const updated = {
        ...current,
        ...rest,
        ...(extra !== undefined ? { extra: merged } : {}),
        ...(filament_id ? { filament: filaments.get(filament_id)! } : {}),
      };
      spools.set(updated.id, updated);
      return json(updated);
    }
    return json({ message: "not found" }, 404);
  }

  return { fetchImpl, vendors, filaments, spools, fields, requests };
}
