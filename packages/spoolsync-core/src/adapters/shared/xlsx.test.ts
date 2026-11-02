import { describe, expect, test } from "bun:test";

import { excelSerialToDate, readXlsx } from "./xlsx";
import { buildXlsx, buildZip } from "./xlsx-fixture";
import { listZipEntries } from "./zip";

describe("readXlsx", () => {
  const sheets = [
    {
      name: "Stock",
      rows: [
        ["Brand", "Qty", "Flag", "Note"],
        ["A & B <Co>", 12.5, true, { inline: "inline text" }],
        [null, null, null, "sparse"],
      ],
    },
    { name: "Other", rows: [["x"]] },
  ];

  test.each([false, true])(
    "reads shared strings, numbers, booleans (stored=%p)",
    async (stored) => {
      const workbook = await readXlsx(buildXlsx(sheets, { stored }));
      expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Stock", "Other"]);
      expect(workbook.sheets[0]?.rows).toEqual([
        ["Brand", "Qty", "Flag", "Note"],
        ["A & B <Co>", 12.5, true, "inline text"],
        [null, null, null, "sparse"],
      ]);
      expect(workbook.sheets[0]?.rowNumbers).toEqual([1, 2, 3]);
    },
  );

  test("rejects files that are not workbooks", async () => {
    await expect(readXlsx(new TextEncoder().encode("Brand,Material\nA,PLA"))).rejects.toThrow(
      "not an Excel",
    );
    await expect(readXlsx(buildZip([{ name: "readme.txt", content: "hi" }]))).rejects.toThrow(
      "not an Excel",
    );
    await expect(readXlsx(new Uint8Array([0x50, 0x4b, 3, 4]))).rejects.toThrow("too small");
  });

  test("rejects a damaged archive instead of returning partial data", async () => {
    const bytes = buildXlsx(sheets);
    await expect(readXlsx(bytes.slice(0, bytes.length - 40))).rejects.toThrow("ZIP");
    const corrupted = bytes.slice();
    const entry = listZipEntries(bytes)[0]!;
    // Flip a byte inside the entry's compressed data (past the local header and file name).
    const position = entry.localHeaderOffset + 30 + entry.name.length + 4;
    corrupted[position] = (corrupted[position] ?? 0) ^ 0xff;
    await expect(readXlsx(corrupted)).rejects.toThrow();
  });
});

describe("excelSerialToDate", () => {
  test("converts serials and rejects out-of-range values", () => {
    expect(excelSerialToDate(46328)).toBe("2026-11-02");
    expect(excelSerialToDate(45292.75)).toBe("2024-01-01");
    expect(excelSerialToDate(0)).toBeNull();
    expect(excelSerialToDate(Number.NaN)).toBeNull();
  });
});
