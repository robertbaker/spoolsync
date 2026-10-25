import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

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
    return this.storage.saveLoadResult(result);
  }

  unload(source: SourceId): void {
    this.nextRevision(source);
    this.storage.clearLoadResult(source);
    this.results.delete(source);
  }
}

export interface LoadContext {
  state: LoadState;
  store(result: LoadResult): void;
}
