import { describe, expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";

import { readScan } from "./scan";

const spools = [
  makeSpool("spoolman", "12", { name: "Blue", upc: "012345678905" }),
  makeSpool("spoolio", "A1", { name: "Red", upc: "0012345678905" }),
  makeSpool("spoolman", "13", { name: "Green", upc: "4006381333931" }),
];

describe("readScan", () => {
  test("opens the spool a SpoolSync label names, whatever the case", () => {
    const hit = readScan("spoolman:13", spools);
    expect(hit).toMatchObject({ kind: "spool" });
    expect(hit.kind === "spool" && hit.spool.name).toBe("Green");
    expect(readScan(" Spoolio:A1 ", spools)).toMatchObject({ kind: "spool" });
  });

  test("says when a label names a spool that is not loaded", () => {
    expect(readScan("spoolman:99", spools)).toEqual({ kind: "not-loaded", code: "spoolman:99" });
    expect(readScan("spoolman:12", [])).toMatchObject({ kind: "not-loaded" });
  });

  test("treats text that only looks like a label as filter text", () => {
    expect(readScan("pla:black", spools)).toEqual({ kind: "text" });
    expect(readScan("spoolman: blue", spools)).toEqual({ kind: "text" });
    expect(readScan("blue", spools)).toEqual({ kind: "text" });
    expect(readScan("   ", spools)).toEqual({ kind: "text" });
  });

  test("finds a spool by its barcode, UPC or EAN", () => {
    const upc = readScan("4006381333931", spools);
    expect(upc.kind === "spool" && upc.spool.sourceId).toBe("13");
    // 12-digit UPC-A and the same number as EAN-13 are the same product.
    expect(readScan("0012345678905", [spools[0]!])).toMatchObject({ kind: "spool" });
    expect(readScan("012345678905", [spools[1]!])).toMatchObject({ kind: "spool" });
  });

  test("does not guess when several spools share a barcode", () => {
    const shared = readScan("012345678905", spools);
    expect(shared.kind).toBe("ambiguous");
    expect(shared.kind === "ambiguous" && shared.spools.map((spool) => spool.sourceId)).toEqual([
      "12",
      "A1",
    ]);
  });

  test("says when a barcode matches nothing", () => {
    expect(readScan("5901234123457", spools)).toEqual({
      kind: "not-loaded",
      code: "5901234123457",
    });
    // Digits that are not a barcode length are filter text (a weight, a price).
    expect(readScan("1000", spools)).toEqual({ kind: "text" });
  });
});
