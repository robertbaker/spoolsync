import { describe, expect, test } from "bun:test";

import { deriveImageWidths } from "./imageSources";

describe("deriveImageWidths", () => {
  test("fixed-size icons get 1x and 2x only", () => {
    expect(deriveImageWidths("24px")).toEqual([24, 48]);
    expect(deriveImageWidths("96px")).toEqual([96, 192]);
  });

  test("fluid images get a sparse list", () => {
    const widths = deriveImageWidths("100vw");
    expect(widths.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < widths.length; i++)
      expect(widths[i]! / widths[i - 1]!).toBeGreaterThanOrEqual(1.4);
    expect(Math.max(...widths)).toBeLessThanOrEqual(2048);
  });

  test("responsive sizes follow the matching breakpoint", () => {
    const widths = deriveImageWidths("(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw");
    expect(Math.max(...widths)).toBeLessThan(1500);
  });

  test("calc and intrinsic caps are respected", () => {
    expect(Math.max(...deriveImageWidths("calc(100vw - 2rem)", 800))).toBe(800);
  });
});
