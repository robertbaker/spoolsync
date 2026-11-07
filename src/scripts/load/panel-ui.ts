import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";

/** The small bordered button the Load page's review panels share. */
export const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
export const PRESSED = "border-primary bg-primary/10 text-foreground";

/** What a spool is called in a list: its vendor, material and name, or its id when it has none. */
export const spoolLabel = (spool: CommonSpool | undefined, key: string) =>
  spool
    ? [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") ||
      `Spool ${spool.sourceId}`
    : key;

/** Every loaded spool by its `source:sourceId` key. */
export function indexSpools(results: ReadonlyMap<SourceId, LoadResult>): Map<string, CommonSpool> {
  const spools = new Map<string, CommonSpool>();
  for (const loaded of results.values())
    for (const spool of loaded.spools) spools.set(`${spool.source}:${spool.sourceId}`, spool);
  return spools;
}

/** Puts focus back on the control with this `data-key`, since a redraw replaces every control. */
export function focusDataKey(container: HTMLElement, key: string | null | undefined): void {
  if (!key) return;
  container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
}
