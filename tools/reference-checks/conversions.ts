import { WRITABLE_SOURCE_IDS } from "../../packages/spoolsync-core/src/core/model";
import type { LoadResult } from "../../packages/spoolsync-core/src/core/model";
import {
  createEmptyInventory,
  loadInventoryFile,
  exportInventory,
} from "../../packages/spoolsync-core/src/workflow";
import type { ReferenceReporter } from "./reporter";

export async function auditConversions(
  name: string,
  loaded: LoadResult,
  reporter: Pick<ReferenceReporter, "passed">,
): Promise<void> {
  for (const target of WRITABLE_SOURCE_IDS) {
    let destination = await createEmptyInventory(target);
    if (target === "filamentDbApp" && loaded.spools.length > 0) {
      // Filament DB requires non-template filaments to exist before spools can be attached.
      const seen = new Set<string>();
      const filaments: Record<string, unknown>[] = [];
      for (let i = 0; i < loaded.spools.length; i++) {
        const spool = loaded.spools[i]!;
        const key = `${spool.vendor ?? ""}\0${spool.material ?? ""}\0${spool.name ?? ""}\0${spool.colors[0] ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        filaments.push({
          _id: `f_${i}`,
          vendor: spool.vendor ?? "Generic",
          type: spool.material ?? "PLA",
          name: spool.name ?? "",
          colorName: spool.name ?? "",
          color: spool.colors[0] ? `#${spool.colors[0]}` : null,
          spools: [],
        });
      }
      destination = await loadInventoryFile(
        "filamentDbApp",
        JSON.stringify({
          version: 8,
          collections: { locations: [], filaments },
        }),
      );
    }
    const changes = loaded.spools.map((spool, index) => ({
      kind: "create" as const,
      source: target,
      groupId: String(index),
      values: spool,
      links: {},
      groupIds: spool.crossIds,
    }));
    const output = await exportInventory(target, destination, changes);
    const reloaded = await loadInventoryFile(target, output.text);
    if (output.created !== loaded.spools.length || reloaded.spools.length !== loaded.spools.length)
      throw new Error(`${name} to ${target}: new-spool count changed during conversion`);
    reporter.passed();
  }
}
