import type { CommonSpool } from "../../packages/spoolsync-core/src/core/model";
import { loadInventoryFile } from "../../packages/spoolsync-core/src/workflow";
import { auditConversions } from "./conversions";
import { auditCycles } from "./cycles";
import { auditEdits } from "./edits";
import { auditEquivalentFiles } from "./equivalent-files";
import { ReferenceReporter, type ReferenceOutput } from "./reporter";
import { sourceFromFilename } from "./source";

export interface ReferenceDependencies extends ReferenceOutput {
  listFiles(): Promise<string[]>;
  readText(name: string): Promise<string>;
}

export async function runReferenceChecks(dependencies: ReferenceDependencies) {
  const reporter = new ReferenceReporter(dependencies);
  const loadedFiles = new Map<string, CommonSpool[]>();
  const inputTexts = new Map<string, string>();
  for (const name of await dependencies.listFiles()) {
    const normalized = name.toLowerCase();
    const source = sourceFromFilename(name);
    if (!source || !/\.(csv|json|ttag|db)$/i.test(name)) continue;
    try {
      const input = await dependencies.readText(name);
      const loaded = await loadInventoryFile(source, input);
      loadedFiles.set(normalized, loaded.spools);
      inputTexts.set(normalized, input);
      dependencies.log(
        `${name}: ${loaded.spools.length} spools, ${loaded.warnings.length} import warnings`,
      );
      await auditConversions(name, loaded, reporter);
      if (source !== "spoolstock" && source !== "bambuddy") {
        await auditEdits(name, source, loaded, reporter);
        await auditCycles(name, source, loaded, reporter);
      }
    } catch (error) {
      if (normalized.startsWith("my-spools-hueforge") && String(error).includes("HueForge")) {
        dependencies.log(`${name}: correctly rejected unsupported HueForge format`);
        reporter.passed();
      } else if (
        source === "spoolman" &&
        normalized.endsWith(".db") &&
        String(error).includes("SQLite database")
      ) {
        dependencies.log(
          `${name}: correctly identified the SQLite database and requested JSON or CSV`,
        );
        reporter.passed();
      } else {
        reporter.failed(name, String(error));
      }
    }
  }
  await auditEquivalentFiles(loadedFiles, inputTexts, reporter);
  return reporter.complete();
}
