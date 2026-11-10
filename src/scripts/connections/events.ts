import type { SourceId } from "@spoolsync/core/core/model";

/** Fired after a connection or session is saved or cleared, so other widgets can refresh. */
export const CONNECTION_CHANGED = "spoolsync:connection-changed";

/** Tells the page which service's connection changed; without one, every service's did. */
export function announceConnectionChange(source?: SourceId): void {
  document.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { source } }));
}

/** The service a CONNECTION_CHANGED event names, or undefined when it covers all of them. */
export function changedConnectionSource(event: Event): SourceId | undefined {
  return (event as CustomEvent<{ source?: SourceId } | null>).detail?.source;
}
