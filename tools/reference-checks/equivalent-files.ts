import type { CommonSpool } from "../../packages/spoolsync-core/src/core/model";
import { loadInventoryFile, exportInventory } from "../../packages/spoolsync-core/src/workflow";
import { compare, stable } from "./compare";
import type { ReferenceReporter } from "./reporter";

export async function auditEquivalentFiles(
  loadedFiles: ReadonlyMap<string, CommonSpool[]>,
  inputTexts: ReadonlyMap<string, string>,
  reporter: ReferenceReporter,
): Promise<void> {
  for (const stem of ["spoolman", "3dfilamentprofiles"]) {
    const csv = loadedFiles.get(`${stem}.csv`);
    const json = loadedFiles.get(`${stem}.json`);
    if (!csv || !json) continue;
    try {
      compare(csv, json, `${stem} CSV versus JSON`, stem === "spoolman");
      reporter.passed();
      if (stem === "3dfilamentprofiles") {
        const source = await loadInventoryFile("threeDfp", inputTexts.get(`${stem}.csv`)!);
        const output = await exportInventory("threeDfp", source, []);
        const generated = await loadInventoryFile("threeDfp", output.text);
        const byId = new Map(generated.spools.map((spool) => [spool.sourceId, spool]));
        for (const spool of json) {
          if (
            JSON.stringify(stable(spool.raw, true)) !==
            JSON.stringify(stable(byId.get(spool.sourceId)?.raw, true))
          )
            throw new Error(
              `${stem}: CSV-to-JSON record metadata or value types differ from the native JSON export`,
            );
        }
        reporter.passed();
      }
    } catch (error) {
      reporter.failed(String(error));
    }
  }
}
