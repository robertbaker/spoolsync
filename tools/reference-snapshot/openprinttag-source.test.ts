import { describe, expect, test } from "bun:test";

import { recordsFromArchive, tarFiles } from "./openprinttag-source";

function entry(name: string, body: string, type = "0"): Uint8Array {
  const data = new TextEncoder().encode(body);
  const header = new Uint8Array(512);
  header.set(new TextEncoder().encode(name).subarray(0, 100), 0);
  header.set(new TextEncoder().encode(`${data.length.toString(8).padStart(11, "0")}\0`), 124);
  header.set(new TextEncoder().encode(type), 156);
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  return Uint8Array.from([...header, ...padded]);
}
const archive = (...entries: Uint8Array[]) =>
  Uint8Array.from([...entries.flatMap((e) => [...e]), ...new Uint8Array(1024)]);

describe("OpenPrintTag archive source", () => {
  test("reads regular files and strips the top directory", () => {
    const files = [
      ...tarFiles(archive(entry("r-main/", "", "5"), entry("r-main/data/a.yaml", "x: 1"))),
    ];
    expect(files).toEqual([{ path: "data/a.yaml", text: "x: 1" }]);
  });

  test("joins the three tables and ignores other files", () => {
    const parse = (text: string) => JSON.parse(text);
    const records = recordsFromArchive(
      archive(
        entry("r-main/data/brands/acme.yaml", '{"slug":"acme","name":"Acme"}'),
        entry(
          "r-main/data/materials/acme/m.yaml",
          '{"slug":"m","brand":{"slug":"acme"},"name":"PLA Red","type":"PLA"}',
        ),
        entry(
          "r-main/data/material-packages/acme/p.yaml",
          '{"slug":"p","material":{"slug":"m"},"nominal_netto_full_weight":1000}',
        ),
        entry("r-main/README.md", "ignored"),
      ),
      parse,
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "p", brand: "Acme", material: "PLA", weight: 1000 });
  });
});
