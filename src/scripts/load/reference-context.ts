import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import type { ProviderSettings, ReferenceProviderId } from "@spoolsync/core/core/reference";

import type { ReferenceController, ReferenceStore } from "./reference-controller";

/** Message under the source controls: the result of the last load or fetch. */
export interface SourceMessage {
  tone: "info" | "error" | "warning";
  text: string;
}

/** What the panel remembers between draws. The views read and write it through the context. */
export interface PanelState {
  /** Cards drawn so far; "Show more" draws the next batch. */
  limit: number;
  sourceMessage: SourceMessage | null;
  /** Unsaved endpoint settings being edited, per provider. */
  drafts: Map<ReferenceProviderId, ProviderSettings>;
  settingsErrors: string[];
  barcodeQuery: string;
  /** The color finder is rebuilt only when the catalog or the spool count changes. */
  finder: {
    catalog: ReferenceController["catalog"];
    key: string;
    element: HTMLElement | null;
  } | null;
}

/**
 * Everything a section of the Reference panel needs from the panel itself: the controller, the
 * storage it was given, the loaded results, the state above, and the few operations that redraw
 * it.
 */
export interface PanelContext {
  readonly controller: ReferenceController;
  readonly store: ReferenceStore;
  readonly results: ReadonlyMap<SourceId, LoadResult>;
  /** The panel body, for views that update a line in place. */
  readonly content: HTMLElement;
  readonly state: PanelState;
  draw(): void;
  /** Refreshes the one-line summary on the panel header. */
  refreshSummary(): void;
  /** Runs a change, toasts the result, redraws, and keeps keyboard focus on the same control. */
  act(change: () => number, done: (count: number) => string): void;
  focusKey(key: string | null | undefined): void;
}
