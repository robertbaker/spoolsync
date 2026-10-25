import { recordsToSpools } from "./map";
import { TtagFileSchema, type TigertagLoadResult, type TtagRecord } from "./schema";

export function loadTtag(text: string): TigertagLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Export a .ttag from Tiger Studio Manager and try again.",
    );
  }
  // A bare list of inventory records (a plain JSON dump) is wrapped in the .ttag envelope.
  if (Array.isArray(parsed))
    parsed = { format: "tigertag", kind: "ttag", version: 1, records: parsed };
  // Settings → Download JSON is a map keyed by uid, including {} for an empty account.
  else if (parsed && typeof parsed === "object" && !("format" in parsed)) {
    const entries = Object.entries(parsed);
    if (
      entries.every(
        ([uid, value]) =>
          /^(TigerData_|CLOUD_|[0-9a-f]+$)/i.test(uid) &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value),
      )
    ) {
      parsed = {
        format: "tigertag",
        kind: "ttag",
        version: 1,
        records: entries.map(([uid, value]) => ({ ...value, uid })),
      };
    }
  }
  const file = TtagFileSchema.safeParse(parsed);
  if (!file.success) {
    throw new Error(
      "This is not a TigerTag file: expected a .ttag backup (version 1) or a JSON list of TigerTag records.",
    );
  }
  const { spools, warnings } = recordsToSpools(file.data.records as TtagRecord[]);
  if (!file.data.exportedBy && spools.length) {
    warnings.push(
      "This file has no exportedBy account. Select Restore in Tiger Studio's import preview to preserve remaining weights and update these IDs; Import makes new copies at full weight.",
    );
  }
  return {
    source: "tigertag",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
    file: file.data,
  };
}
