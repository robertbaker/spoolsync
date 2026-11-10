import { expect, test } from "bun:test";

import { SOURCE_FIELDS } from "./fields";

test("single-temperature services compare the min fields only", () => {
  for (const source of ["spoolman", "spoolio", "tigertag", "threeDfp"] as const) {
    expect(SOURCE_FIELDS[source].has("nozzleTempMax")).toBe(false);
    expect(SOURCE_FIELDS[source].has("bedTempMax")).toBe(false);
  }
  for (const source of ["spoolio", "tigertag"] as const) {
    expect(SOURCE_FIELDS[source].has("nozzleTempMin")).toBe(true);
    expect(SOURCE_FIELDS[source].has("bedTempMin")).toBe(true);
  }
  expect(SOURCE_FIELDS.spoolstock.has("nozzleTempMax")).toBe(true);
});
