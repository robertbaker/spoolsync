import { expect, test } from "bun:test";

import { buildXlsx } from "../../spoolsync-core/src/adapters/shared/xlsx-fixture";
import { parseArgs } from "./args";
import { loadInputs } from "./inputs";
import { defaultDependencies } from "./runtime";

test("binary sources are read as bytes and text sources as text", async () => {
  const workbook = buildXlsx([
    {
      name: "Stock",
      rows: [
        ["Brand", "Material", "Color"],
        ["Elegoo", "PLA", "blue"],
      ],
    },
  ]);
  const reads: string[] = [];
  const { loaded } = await loadInputs(
    parseArgs(["--spoolmaster", "stock.xlsx", "--spoolkeep", "keep.json"]),
    {
      ...defaultDependencies,
      async readBytes(filename) {
        reads.push(`bytes:${filename}`);
        return workbook;
      },
      async readText(filename) {
        reads.push(`text:${filename}`);
        return JSON.stringify([{ id: "k1", brand: "Creality", family: "PLA", newQuantity: 1 }]);
      },
    },
  );
  expect(reads).toEqual(["bytes:stock.xlsx", "text:keep.json"]);
  expect(loaded.get("spoolmaster")?.spools[0]?.vendor).toBe("Elegoo");
  expect(loaded.get("spoolkeep")?.spools[0]?.sourceId).toBe("k1");
});

test("load failures name the source and file", async () => {
  await expect(
    loadInputs(parseArgs(["--spoolmaster", "bad.xlsx", "--spoolkeep", "keep.json"]), {
      ...defaultDependencies,
      readBytes: async () => new TextEncoder().encode("not a workbook"),
      readText: async () => "[]",
    }),
  ).rejects.toThrow('Could not load spoolmaster inventory from "bad.xlsx"');
});
