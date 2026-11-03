import { describe, expect, test } from "bun:test";

import { jumpBarSummary } from "./jump-bar";

describe("jumpBarSummary", () => {
  test("keeps the changes-only wording", () => {
    expect(jumpBarSummary({ changes: 2, services: 2, pending: 0 })).toBe(
      "2 changes ready across 2 services",
    );
    expect(jumpBarSummary({ changes: 1, services: 1, pending: 0 })).toBe(
      "1 change ready across 1 service",
    );
  });

  test("leads with pending matches", () => {
    expect(jumpBarSummary({ changes: 0, services: 0, pending: 3 })).toBe("Pending matches (3)");
    expect(jumpBarSummary({ changes: 1, services: 1, pending: 3 })).toBe(
      "Pending matches (3) · 1 change ready across 1 service",
    );
  });

  test("is empty when nothing needs attention", () => {
    expect(jumpBarSummary({ changes: 0, services: 0, pending: 0 })).toBe("");
  });
});
