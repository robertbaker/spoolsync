import { describe, expect, test } from "bun:test";

import { loadSpoolAppJson } from ".";

const backup = (spools: unknown[]) =>
  JSON.stringify({
    version: "1.6",
    backupFormat: "json",
    categories: [],
    spools,
  });

describe("loadSpoolAppJson", () => {
  test("maps single- and multi-colour spools", () => {
    const result = loadSpoolAppJson(
      backup([
        {
          id: "A",
          brand: "Bambu Lab",
          materialType: "PLA",
          colourName: "Pink",
          colourHex: "#F79FAE",
          isMulticolour: false,
          multiHexes: [],
          nominalWeight: 1000,
          currentWeight: 859,
          emptySpoolGrams: 23,
          diameterMm: 1.75,
          nozzleTemp: 220,
          bedTemp: 67,
          purchasePrice: 55,
          purchaseDate: "2026-06-02T13:16:59Z",
          notes: "n",
          isArchived: false,
          isFinished: false,
          lifecycleRaw: "active",
        },
        {
          id: "B",
          brand: "Numakers",
          materialType: "PLA",
          colourName: "Rainbow",
          colourHex: "#6ABCF6",
          isMulticolour: true,
          multiHexes: ["#6ABCF6", "#FF40FF"],
          nominalWeight: 1000,
          currentWeight: 0,
          isFinished: true,
        },
      ]),
    );
    expect(result.warnings).toEqual([]);
    expect(result.spools[0]).toMatchObject({
      sourceId: "A",
      crossIds: { spoolappId: "A" },
      vendor: "Bambu Lab",
      material: "PLA",
      name: "Pink",
      colors: ["F79FAE"],
      nozzleTempMin: 220,
      nozzleTempMax: 220,
      bedTempMin: 67,
      initialWeight: 1000,
      remainingWeight: 859,
      emptySpoolWeight: 23,
      price: 55,
      purchasedOn: "2026-06-02",
      comment: "n",
      archived: false,
    });
    expect(result.spools[1]).toMatchObject({
      colors: ["6ABCF6", "FF40FF"],
      remainingWeight: 0,
      archived: true,
    });
  });

  test("keeps valid spools when one is malformed and treats retired lifecycles as archived", () => {
    const result = loadSpoolAppJson(
      backup([{ brand: "No id" }, { id: "C", lifecycleRaw: "Archived" }]),
    );
    expect(result.spools.map((spool) => spool.sourceId)).toEqual(["C"]);
    expect(result.spools[0]?.archived).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Spool 1");
  });

  test("rejects invalid JSON and files without a spools list", () => {
    expect(() => loadSpoolAppJson("{")).toThrow("not valid JSON");
    expect(() => loadSpoolAppJson("[]")).toThrow("Spool app backup");
    expect(() => loadSpoolAppJson('{"prints":[]}')).toThrow("Spool app backup");
  });
});

describe("Spool app comment composition", () => {
  test("adds product line, colour description and purchase URL after notes", () => {
    const result = loadSpoolAppJson(
      backup([
        {
          id: "P",
          notes: "keep dry",
          productLine: "Silk+",
          multicolourDescription: "Red to gold",
          purchaseUrl: "https://example.com/p",
        },
        { id: "Q", productLine: "Basic" },
        { id: "R" },
      ]),
    );
    expect(result.spools[0]?.comment).toBe(
      "keep dry\nProduct line: Silk+\nColours: Red to gold\nPurchase URL: https://example.com/p",
    );
    expect(result.spools[1]?.comment).toBe("Product line: Basic");
    expect(result.spools[2]?.comment).toBeNull();
  });
});

describe("loadSpoolAppJson BOM and duplicates", () => {
  test("reads a backup that starts with a byte order mark", () => {
    expect(loadSpoolAppJson(`﻿${backup([{ id: "A" }])}`).spools).toHaveLength(1);
  });

  test("warns about a repeated ID and keeps both entries for the workflow to reject", () => {
    const result = loadSpoolAppJson(
      backup([{ id: "A", brand: "First" }, { id: "A", brand: "Second" }, { id: "B" }]),
    );
    expect(result.spools.map((spool) => spool.vendor)).toEqual(["First", "Second", null]);
    expect(result.warnings).toEqual([
      "Spool A appears more than once; each spool needs a unique ID.",
    ]);
  });
});
