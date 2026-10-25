import type { SourceId } from "@spoolsync/core/core/model";

import { clearResolutions, clearMatchDecisions } from "./choices";
import { readLoadResult, clearLoadResult } from "./inventories";

export function invalidateApiInventory(source: SourceId): void {
  if (readLoadResult(source)?.origin === "api") clearLoadResult(source);
  clearResolutions();
  clearMatchDecisions();
}
