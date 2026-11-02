import type { CommonSpool, LoadResult } from "../../core/model";
import { spoolAppToCommon } from "./map";
import { SpoolAppBackupSchema, SpoolAppSpoolSchema } from "./schema";

/** Loads the spools from a Spool app JSON backup. */
export function loadSpoolAppJson(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Export a backup from the Spool app and try again.",
    );
  }
  const backup = SpoolAppBackupSchema.safeParse(parsed);
  if (!backup.success)
    throw new Error("This does not look like a Spool app backup: there is no spools list.");
  const warnings: string[] = [];
  const spools: CommonSpool[] = [];
  backup.data.spools.forEach((entry, index) => {
    const spool = SpoolAppSpoolSchema.safeParse(entry);
    if (spool.success) spools.push(spoolAppToCommon(spool.data));
    else
      warnings.push(
        `Spool ${index + 1}: ${spool.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
      );
  });
  return {
    source: "spoolapp",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
