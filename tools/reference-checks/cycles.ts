import type { PlannedChange } from "../../packages/spoolsync-core/src/core/compare";
import type { LoadResult, WritableSourceId } from "../../packages/spoolsync-core/src/core/model";
import { loadInventoryFile, exportInventory } from "../../packages/spoolsync-core/src/workflow";
import { compare } from "./compare";
import type { ReferenceReporter } from "./reporter";

export async function auditCycles(
  name: string,
  source: Exclude<WritableSourceId, "bambuddy">,
  loaded: LoadResult,
  reporter: Pick<ReferenceReporter, "passed">,
): Promise<void> {
  let current = loaded;
  for (let cycle = 1; cycle <= 3; cycle++) {
    // TigerTag downloads contain only changed records: include all loaded spools explicitly.
    const changes =
      source === "tigertag"
        ? current.spools.map<PlannedChange>((spool) => ({
            kind: "update" as const,
            source,
            groupId: spool.sourceId,
            spool,
            links: {},
            changes: [],
          }))
        : [];
    const exported = await exportInventory(source, current, changes);
    for (const [format, text] of [
      ["primary", exported.text],
      ...(exported.alternateFiles ?? []).map((file) => [file.extension, file.text]),
    ]) {
      const reread = await loadInventoryFile(source, text!);
      compare(
        loaded.spools,
        reread.spools,
        `${name}, ${format}, cycle ${cycle}`,
        format === "primary" && (source !== "threeDfp" || name.endsWith(".json")),
        !(source === "filameter" && format === "csv"),
      );
      reporter.passed();
    }
    current = await loadInventoryFile(source, exported.text);
  }
}
