import type { CommonSpool } from "../../core/model";
import { spoolioToCommon } from "./map";
import { SpoolioExportSchema, SpoolioFilamentSchema, type SpoolioLoadResult } from "./schema";

export function loadSpoolioJson(text: string): SpoolioLoadResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Export from spoolio.net settings and try again.");
  }
  const file = SpoolioExportSchema.safeParse(parsed);
  if (!file.success) {
    throw new Error("This does not look like a Spoolio export: there is no filaments list.");
  }
  const spools: CommonSpool[] = [];
  file.data.filaments.forEach((entry, index) => {
    const filament = SpoolioFilamentSchema.safeParse(entry);
    if (filament.success) spools.push(spoolioToCommon(filament.data));
    else
      warnings.push(
        `Filament ${index + 1}: ${filament.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
      );
  });
  return {
    source: "spoolio",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
    file: file.data,
  };
}
