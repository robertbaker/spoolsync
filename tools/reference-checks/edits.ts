import {
  SOURCE_FIELDS,
  valuesEqual,
  type SpoolValues,
  type PlannedChange,
} from "../../packages/spoolsync-core/src/core/compare";
import type { LoadResult, WritableSourceId } from "../../packages/spoolsync-core/src/core/model";
import { loadInventoryFile, exportInventory } from "../../packages/spoolsync-core/src/workflow";
import { compare } from "./compare";
import type { ReferenceReporter } from "./reporter";

const editedValues: SpoolValues = {
  vendor: "Audit vendor",
  material: "PETG",
  name: "Audit",
  colors: ["123456"],
  diameter: 1.75,
  density: 1.27,
  nozzleTempMin: 190,
  nozzleTempMax: 220,
  bedTempMin: 45,
  bedTempMax: 65,
  upc: "123456789",
  initialWeight: 1500,
  remainingWeight: 350,
  emptySpoolWeight: 210,
  location: "Audit shelf",
  price: 1.25,
  purchasedOn: "2026-10-27",
  comment: "Audit note",
  archived: true,
};

export async function auditEdits(
  name: string,
  source: Exclude<WritableSourceId, "bambuddy">,
  loaded: LoadResult,
  reporter: Pick<ReferenceReporter, "passed">,
): Promise<void> {
  for (const spool of loaded.spools.slice(0, 5)) {
    for (const reverse of [false, true]) {
      const edits = [...SOURCE_FIELDS[source]].map((field) => ({
        field,
        from: spool[field],
        to: editedValues[field],
      }));
      if (reverse) edits.reverse();
      const output = await exportInventory(source, loaded, [
        { kind: "update", source, groupId: spool.sourceId, spool, links: {}, changes: edits },
      ]);
      for (const [format, text] of [
        ["primary", output.text],
        ...(output.alternateFiles ?? []).map((file) => [file.extension, file.text]),
      ]) {
        const rows = (await loadInventoryFile(source, text!)).spools;
        const after =
          source === "filameter" && format === "csv"
            ? rows[loaded.spools.indexOf(spool)]
            : rows.find((row) => row.sourceId === spool.sourceId);
        if (!after) throw new Error(`${name}: combined edits lost a spool ID`);
        for (const edit of edits)
          if (!valuesEqual(edit.field, edit.to, after[edit.field]))
            throw new Error(
              `${name}: ${edit.field} changed in ${reverse ? "reverse" : "forward"} edit order`,
            );
        reporter.passed();
      }
    }
  }
  const first = loaded.spools[0];
  if (first) {
    const material = first.material === "PLA" ? "PETG" : "PLA";
    const changes = (source === "tigertag" ? loaded.spools : [first]).map<PlannedChange>(
      (spool) => ({
        kind: "update" as const,
        source,
        groupId: spool.sourceId,
        spool,
        links: {},
        changes:
          spool.sourceId === first.sourceId
            ? [
                { field: "material" as const, from: first.material, to: material },
                { field: "vendor" as const, from: first.vendor, to: "SpoolSync audit vendor" },
                {
                  field: "comment" as const,
                  from: first.comment,
                  to: "SpoolSync reference audit",
                },
              ]
            : [],
      }),
    );
    const edited = await exportInventory(source, loaded, changes);
    const expected = loaded.spools.map((spool) =>
      spool.sourceId === first.sourceId
        ? {
            ...spool,
            material,
            vendor: "SpoolSync audit vendor",
            comment: "SpoolSync reference audit",
          }
        : spool,
    );
    for (const [format, text] of [
      ["primary", edited.text],
      ...(edited.alternateFiles ?? []).map((file) => [file.extension, file.text]),
    ]) {
      compare(
        expected,
        (await loadInventoryFile(source, text!)).spools,
        `${name}, ${format}, edited fields`,
        false,
        !(source === "filameter" && format === "csv"),
      );
      reporter.passed();
    }
  }
}
