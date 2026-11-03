import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

/** Fired on `document` when an inventory is stored or unloaded; the workflow stepper listens. */
export const INVENTORIES_CHANGED_EVENT = "spoolsync:inventories-changed";

function announceChange(): void {
  if (typeof document !== "undefined") document.dispatchEvent(new Event(INVENTORIES_CHANGED_EVENT));
}

export interface InventoryStorage {
  readLoadResult(source: SourceId): LoadResult | null;
  saveLoadResult(result: LoadResult): boolean;
  clearLoadResult(source: SourceId): void;
}

/** Coordinates competing file/API requests and page-local inventories. */
export class LoadState {
  readonly results = new Map<SourceId, LoadResult>();
  private readonly revisions = new Map<SourceId, number>();

  constructor(private readonly storage: InventoryStorage) {}

  restore(source: SourceId): void {
    const previous = this.storage.readLoadResult(source);
    if (previous) this.results.set(source, previous);
  }

  nextRevision(source: SourceId): number {
    const revision = (this.revisions.get(source) ?? 0) + 1;
    this.revisions.set(source, revision);
    return revision;
  }

  isCurrent(source: SourceId, revision: number): boolean {
    return this.revisions.get(source) === revision;
  }

  store(result: LoadResult): boolean {
    this.results.set(result.source, result);
    const saved = this.storage.saveLoadResult(result);
    announceChange();
    return saved;
  }

  unload(source: SourceId): void {
    this.nextRevision(source);
    this.storage.clearLoadResult(source);
    this.results.delete(source);
    announceChange();
  }
}

export interface LoadContext {
  state: LoadState;
  store(result: LoadResult): void;
  /** Called after a file was stored, so the page can compare it with the previous file. */
  fileLoaded?(result: LoadResult): void;
}
