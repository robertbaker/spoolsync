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
    const destination = await createEmptyInventory(target);
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
