import { describe, expect, test } from "bun:test";

import { filamentDbApiKey } from "./services";

describe("filamentDbApiKey", () => {
  test("prefers the option, then FILAMENT_DB_API_KEY, then FILAMENTDB_API_KEY", () => {
    const both = { FILAMENT_DB_API_KEY: "primary", FILAMENTDB_API_KEY: "server-name" };
    expect(filamentDbApiKey({ filamentDbToken: "flag" }, both)).toBe("flag");
    expect(filamentDbApiKey({}, both)).toBe("primary");
    expect(filamentDbApiKey({}, { FILAMENTDB_API_KEY: "server-name" })).toBe("server-name");
  });

  test("an empty variable counts as unset, and no key gives undefined", () => {
    expect(
      filamentDbApiKey({}, { FILAMENT_DB_API_KEY: "", FILAMENTDB_API_KEY: "server-name" }),
    ).toBe("server-name");
    expect(filamentDbApiKey({}, {})).toBeUndefined();
  });
});
