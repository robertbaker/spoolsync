import { expect, test } from "bun:test";

import { SpoolmanClient, type SpoolmanTransport } from "./client";

test("Spoolman endpoint operations accept an injected transport without fetch or HTTP state", async () => {
  const calls: Array<{ method: string; path: string; query?: unknown; body?: unknown }> = [];
  const transport: SpoolmanTransport = {
    baseUrl: new URL("https://spoolman.test/"),
    apiUrl: (path) => `https://spoolman.test/api/v1${path}`,
    requestInit: (init = {}) => ({ ...init, credentials: "omit" }),
    async request(method, path, options) {
      calls.push({ method, path, query: options.query });
      return options.schema.parse(path === "/field/spool" ? [{ key: "existing" }] : []);
    },
    async send(method, path, options) {
      calls.push({ method, path, body: options.body });
      return { body: "" };
    },
  };
  const client = new SpoolmanClient(
    { baseUrl: "https://spoolman.test" },
    undefined,
    undefined,
    transport,
  );
  expect(client.baseUrl).toBe(transport.baseUrl);
  expect(client.apiUrl("/spool")).toBe("https://spoolman.test/api/v1/spool");
  expect(client.requestInit({ method: "GET" })).toEqual({ method: "GET", credentials: "omit" });
  expect(await client.listSpools()).toEqual([]);
  expect(await client.ensureExtraFields("spool", { existing: "Existing", added: "Added" })).toEqual(
    ["added"],
  );
  expect(calls).toEqual([
    { method: "GET", path: "/spool", query: { allow_archived: true, limit: 1000, offset: 0 } },
    { method: "GET", path: "/field/spool", query: undefined },
    { method: "POST", path: "/field/spool/added", body: { name: "Added", field_type: "text" } },
  ]);
});
