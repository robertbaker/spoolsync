import { expect, test } from "bun:test";

import { SOURCE_FIELDS } from "../../core/comparison/fields";
import { FilamentDbClient } from "./client";
import { createRecord, updateRecord } from "./records";
import type { FilamentDbSpool } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** FilamentDB as it behaves with user management on or off; `/api/spools` never refuses a read. */
function clientFor(userManagement: boolean | undefined, tokenValid: boolean, token?: string) {
  const paths: string[] = [];
  const client = new FilamentDbClient({
    baseUrl: "http://filamentdb.test",
    token,
    fetchImpl: async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === "/api/config/auth")
        return userManagement === undefined
          ? json({ message: "not found" }, 404)
          : json({ enabled: userManagement });
      if (path === "/api/auth/me") return json({}, tokenValid ? 200 : 401);
      return json([{ serial: "public" }]);
    },
  });
  return { client, paths };
}

test("the spool list is read directly when user management is off", async () => {
  const { client, paths } = clientFor(false, false);
  expect(await client.listSpools()).toHaveLength(1);
  expect(paths).toEqual(["/api/config/auth", "/api/spools"]);
});

test("a server without the auth config route is read as before", async () => {
  const { client } = clientFor(undefined, false);
  expect(await client.listSpools()).toHaveLength(1);
});

test("a partial list is refused when no token is set", async () => {
  await expect(clientFor(true, false).client.listSpools()).rejects.toThrow(
    "hides private spools without a session token",
  );
});

test("a partial list is refused when the token has expired", async () => {
  await expect(clientFor(true, false, "old").client.listSpools()).rejects.toThrow(
    "refused the session token",
  );
});

test("a valid token reads the list", async () => {
  expect(await clientFor(true, true, "good").client.listSpools()).toHaveLength(1);
});

test("archived is neither compared nor written, because `deleted` is FilamentDB's recycle bin", () => {
  expect(SOURCE_FIELDS.filamentdb.has("archived")).toBe(false);

  const record: FilamentDbSpool = { serial: "A1", lastUpdated: 1 };
  updateRecord(
    record,
    {
      kind: "update",
      source: "filamentdb",
      groupId: "g",
      links: {},
      changes: [{ field: "archived", from: false, to: true }],
    } as unknown as Parameters<typeof updateRecord>[1],
    () => {},
  );
  expect(record).not.toHaveProperty("deleted");

  const warnings: string[] = [];
  const created = createRecord(
    { archived: true, colors: [] } as unknown as Parameters<typeof createRecord>[0],
    "FilamentDB new",
    (message) => warnings.push(message),
  );
  expect(created).not.toHaveProperty("deleted");
  expect(warnings).toContain(
    "FilamentDB new: FilamentDB has no archived state, so this spool is active.",
  );
});
