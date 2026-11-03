import type { CommonSpool } from "../core/model";

/** A key that is unique across services: the source plus the id in that source. */
export function spoolKey(spool: Pick<CommonSpool, "source" | "sourceId">): string {
  return `${spool.source}:${spool.sourceId}`;
}
