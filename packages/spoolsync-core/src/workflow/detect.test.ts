import { expect, test } from "bun:test";

import { buildXlsx } from "../adapters/shared/xlsx-fixture";
import { detectInventorySources } from "./detect";

const detect = async (name: string, input: string | Uint8Array) =>
  (await detectInventorySources(name, input)).map((match) => match.source);

test("detects each Mac/iOS app export uniquely", async () => {
  expect(
    await detect(
      "stock.xlsx",
      buildXlsx([
        {
          name: "Stock",
          rows: [
            ["Brand", "Material"],
            ["Elegoo", "PLA"],
          ],
        },
      ]),
    ),
  ).toEqual(["spoolmaster"]);
  expect(
    await detect(
      "Spool_Backup.json",
      JSON.stringify({
        version: "1.6",
        backupFormat: "json",
        spools: [{ id: "a", brand: "X", materialType: "PLA" }],
      }),
    ),
  ).toEqual(["spoolapp"]);
  expect(
    await detect(
      "SpoolKeep.json",
      JSON.stringify([{ id: "k", brand: "X", family: "PLA", newQuantity: 1 }]),
    ),
  ).toContain("spoolkeep");
  expect(await detect("h.csv", "spoolId,brand,material\nh1,Hatchbox,PLA\n")).toEqual([
    "spoolhoarder",
  ]);
  expect(
    await detect(
      "hf.csv",
      "Brand,Type,Color,Name,TD,Tags,Secondary_Type,Secondary_Color,Secondary_Strength,Owned,Uuid\nAzure,ABS,#457ab1,Blue,1.2,,None,#0000ff,0,true,\n",
    ),
  ).toEqual(["spoolhoarder"]);
});

test("detects existing formats and never guesses empty or foreign files", async () => {
  expect(
    await detect(
      "spoolio.json",
      JSON.stringify({ version: 1, filaments: [{ id: "s", type: "PLA" }] }),
    ),
  ).toEqual(["spoolio"]);
  expect(await detect("empty.json", "[]")).toEqual([]);
  expect(await detect("notes.csv", "a,b\n1,2\n")).toEqual([]);
  expect(await detect("junk.json", "{nope")).toEqual([]);
  expect(await detect("junk.xlsx", new TextEncoder().encode("not a zip"))).toEqual([]);
});
