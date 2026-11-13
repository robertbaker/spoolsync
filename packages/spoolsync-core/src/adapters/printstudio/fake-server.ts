import type { PrintStudioFetch } from "./client";
import type { PrintStudioLot } from "./types";

/** A stand-in PrintStudio API: same routes, guards and bodies as `apps/api`, kept in memory. */
export function createFakePrintStudio(initial: PrintStudioLot[] = [], operatorId = "web-ops") {
  const store = new Map(initial.map((lot) => [lot.id, structuredClone(lot)]));
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  let nextId = 1;
  const fetchImpl: PrintStudioFetch = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path: url.pathname, ...(body === undefined ? {} : { body }) });
    const headers = new Headers(init?.headers);
    if (headers.get("x-operator-id") !== operatorId)
      return Response.json({ error: "Forbidden" }, { status: 403 });
    if (method === "GET" && url.pathname === "/materials")
      return Response.json([...store.values()]);
    if (method === "POST" && url.pathname === "/api/materials") {
      const lot = { ...body, id: `local-${nextId++}`, sourceSystem: "local" };
      store.set(lot.id, lot);
      return Response.json(lot, { status: 201 });
    }
    const adjust = /^\/materials\/([^/]+)\/adjust-stock$/.exec(url.pathname);
    if (method === "POST" && adjust) {
      const lot = store.get(decodeURIComponent(adjust[1]!));
      if (!lot) return Response.json({ error: "missing" }, { status: 404 });
      lot["quantityOnHand"] = Number(lot["quantityOnHand"]) + body.quantityDelta;
      return Response.json({ material: lot });
    }
    const details = /^\/api\/materials\/([^/]+)\/details$/.exec(url.pathname);
    if (method === "PATCH" && details) {
      const lot = store.get(decodeURIComponent(details[1]!))!;
      for (const [key, value] of Object.entries(body)) if (value === null) delete lot[key];
      return Response.json({ material: lot });
    }
    const one = /^\/api\/materials\/([^/]+)$/.exec(url.pathname);
    if (method === "PUT" && one) {
      const lot = store.get(decodeURIComponent(one[1]!));
      if (!lot || lot.sourceSystem !== "local")
        return Response.json({ error: "Local material lot not found" }, { status: 404 });
      store.set(lot.id, { ...lot, ...body });
      return Response.json(store.get(lot.id));
    }
    return new Response("not found", { status: 404 });
  };
  return { store, requests, fetchImpl };
}
