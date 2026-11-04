import { describe, expect, test } from "bun:test";

import { loadSpoolHoarderCsv } from ".";
import { loadInventoryFile } from "../../workflow";

const TEMPLATE_HEADER =
  "spoolId,brand,material,name,colors,colorFamily,colorHexCodes,features,filamentNotes,productFamily,diameter,spoolSize,purchaseSource,createdAt,price,priceCurrency,inventoryLocation,remainingWeight,emptySpoolWeight,weightBasis,notes,dateOpened,lastDried,dryCycles,depleted,status,statusSince,statusNote,exitWeightGrams,exitAmount,extruderTemp,bedTemp,isDeleted";

function templateRow(values: Record<string, string>): string {
  return TEMPLATE_HEADER.split(",")
    .map((column) => {
      const value = values[column] ?? "";
      return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    })
    .join(",");
}

describe("loadSpoolHoarderCsv inventory CSV", () => {
  test("maps the template row and synthesizes a missing spoolId", () => {
    const result = loadSpoolHoarderCsv(
      `${TEMPLATE_HEADER}\n${templateRow({ brand: "Hatchbox", material: "PLA", name: "True Red", colorHexCodes: "E53935", diameter: "1.75", spoolSize: "1000", price: "24.99", remainingWeight: "1000" })}\n`,
    );
    expect(result.warnings).toEqual([]);
    expect(result.spools[0]).toMatchObject({
      source: "spoolhoarder",
      sourceId: "row-1",
      vendor: "Hatchbox",
      material: "PLA",
      name: "True Red",
      colors: ["E53935"],
      diameter: 1.75,
      initialWeight: 1000,
      remainingWeight: 1000,
      price: 24.99,
      archived: false,
    });
  });

  test("handles gross weights, temperatures, hex lists, depletion and duplicates", () => {
    const result = loadSpoolHoarderCsv(
      [
        TEMPLATE_HEADER,
        templateRow({
          spoolId: "a",
          brand: "X",
          material: "PETG",
          colorHexCodes: '["#112233","#445566"]',
          spoolSize: "1000",
          remainingWeight: "600",
          emptySpoolWeight: "200",
          weightBasis: "gross",
          extruderTemp: "240",
          bedTemp: "70",
          inventoryLocation: "Box 2",
        }),
        templateRow({
          spoolId: "b",
          brand: "X",
          material: "PLA",
          status: "Depleted",
          colors: "Blue",
          remainingWeight: "0",
        }),
        templateRow({ spoolId: "a", brand: "Dup", material: "PLA" }),
        templateRow({
          spoolId: "gone",
          brand: "Y",
          material: "PLA",
          isDeleted: "true",
        }),
      ].join("\n"),
    );
    expect(result.spools.map((spool) => spool.sourceId)).toEqual(["a", "b"]);
    expect(result.spools[0]).toMatchObject({
      colors: ["112233", "445566"],
      remainingWeight: 400,
      emptySpoolWeight: 200,
      nozzleTempMin: 240,
      nozzleTempMax: 240,
      bedTempMin: 70,
      location: "Box 2",
    });
    expect(result.spools[1]).toMatchObject({ archived: true, name: "Blue" });
    expect(result.warnings).toEqual([
      "Row 4: ID a appears more than once; using the first row.",
      "Row 5: marked deleted in Spool Hoarder; skipped.",
    ]);
  });
});

describe("loadSpoolHoarderCsv HueForge export", () => {
  const header =
    "Brand,Type,Color,Name,TD,Tags,Secondary_Type,Secondary_Color,Secondary_Strength,Owned,Uuid";

  test("maps colors without weights and archives un-owned entries", () => {
    const result = loadSpoolHoarderCsv(
      `${header}\nAzureFilm,ABS,#457ab1,Plus Blue,1.2,,None,#0000ff,0,true,\nAzureFilm,PLA,#ffffff,White,0.8,,None,#0000ff,0,false,uuid-2\n`,
    );
    expect(result.spools).toHaveLength(2);
    expect(result.spools[0]).toMatchObject({
      sourceId: "row-1",
      vendor: "AzureFilm",
      material: "ABS",
      name: "Plus Blue",
      colors: ["457AB1"],
      initialWeight: null,
      remainingWeight: null,
      archived: false,
    });
    expect(result.spools[1]).toMatchObject({
      sourceId: "uuid-2",
      archived: true,
    });
    expect(result.warnings[0]).toContain("HueForge library export");
  });
});

test("rejects other CSV files and flows through the workflow", async () => {
  expect(() => loadSpoolHoarderCsv("a,b\n1,2\n")).toThrow("Spool Hoarder export");
  const loaded = await loadInventoryFile(
    "spoolhoarder",
    new TextEncoder().encode(
      `${TEMPLATE_HEADER}\n${templateRow({ spoolId: "z", brand: "B", material: "PLA" })}\n`,
    ),
  );
  expect(loaded.spools[0]?.sourceId).toBe("z");
});

describe("Spool Hoarder weight basis, notes and TD", () => {
  const gross = (basis: string) =>
    loadSpoolHoarderCsv(
      `${TEMPLATE_HEADER}
${templateRow({ spoolId: "g", brand: "X", material: "PLA", remainingWeight: "600", emptySpoolWeight: "200", weightBasis: basis })}
`,
    ).spools[0]!;

  test("only subtracts the spool for gross, total or with-spool bases", () => {
    expect(gross("gross").remainingWeight).toBe(400);
    expect(gross("Total").remainingWeight).toBe(400);
    expect(gross("with spool").remainingWeight).toBe(400);
    expect(gross("net").remainingWeight).toBe(600);
    expect(gross("without spool").remainingWeight).toBe(600);
    expect(gross("").remainingWeight).toBe(600);
  });

  test("joins filament notes with spool notes", () => {
    const load = (values: Record<string, string>) =>
      loadSpoolHoarderCsv(
        `${TEMPLATE_HEADER}
${templateRow({ spoolId: "n", brand: "X", material: "PLA", ...values })}
`,
      ).spools[0]!;
    expect(load({ filamentNotes: "Dry first", notes: "Shelf" }).comment).toBe("Dry first\nShelf");
    expect(load({ filamentNotes: "Dry first" }).comment).toBe("Dry first");
    expect(load({ notes: "Shelf" }).comment).toBe("Shelf");
    expect(load({}).comment).toBeNull();
  });

  test("reads HueForge TD or Transmissivity into the shared td field", () => {
    const td = loadSpoolHoarderCsv(
      "Brand,Type,Color,Name,TD,Owned\nA,PLA,#ffffff,White,0.8,true\n",
    );
    expect(td.spools[0]?.td).toBe(0.8);
    const alt = loadSpoolHoarderCsv(
      "Brand,Type,Color,Name,Transmissivity,Owned\nA,PLA,#ffffff,White,1.2,true\n",
    );
    expect(alt.spools[0]?.td).toBe(1.2);
  });
});
