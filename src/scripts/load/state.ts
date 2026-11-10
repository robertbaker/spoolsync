import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

/** Fired on `document` when an inventory is stored or unloaded; the workflow stepper listens. */
export const INVENTORIES_CHANGED_EVENT = "spoolsync:inventories-changed";

export function announceChange(): void {
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
  /** Server requests started at or before this revision used a connection that has since changed. */
  private readonly apiFloors = new Map<SourceId, number>();

  /** Bumped by everything except a stored file, so a pending file read can tell it was displaced. */
  private readonly foreignRevisions = new Map<SourceId, number>();
  private readonly fileReads = new Map<SourceId, number>();
  private readonly storedFileReads = new Map<SourceId, number>();

  constructor(private readonly storage: InventoryStorage) {}

  restore(source: SourceId): void {
    const previous = this.storage.readLoadResult(source);
    if (previous) this.results.set(source, previous);
  }

  currentRevision(source: SourceId): number {
    return this.revisions.get(source) ?? 0;
  }

  /**
   * Starts a new request revision. A stored file read passes `byFile` so that other file reads in
   * flight are not displaced by it; their own start order decides between them.
   */
  nextRevision(source: SourceId, byFile = false): number {
    const revision = (this.revisions.get(source) ?? 0) + 1;
    this.revisions.set(source, revision);
    if (!byFile) this.foreignRevisions.set(source, (this.foreignRevisions.get(source) ?? 0) + 1);
    return revision;
  }

  /** Changes whenever something other than a stored file took the source (server load, unload). */
  foreignRevision(source: SourceId): number {
    return this.foreignRevisions.get(source) ?? 0;
  }

  /** Numbers a file read as it starts, so the newest-started read of a source wins. */
  startFileRead(source: SourceId): number {
    const ticket = (this.fileReads.get(source) ?? 0) + 1;
    this.fileReads.set(source, ticket);
    return ticket;
  }

  isLatestFileRead(source: SourceId, ticket: number): boolean {
    return this.fileReads.get(source) === ticket;
  }

  /** Whether a read that started after this one has already stored its file. */
  isFileReadSuperseded(source: SourceId, ticket: number): boolean {
    return (this.storedFileReads.get(source) ?? 0) > ticket;
  }

  /**
   * A file read that is about to store claims the source: false when a newer-started read already
   * stored. A claim supersedes server loads in flight, but not other file reads, which keep their
   * own start order.
   */
  claimFileStore(source: SourceId, ticket: number): boolean {
    if (this.isFileReadSuperseded(source, ticket)) return false;
    this.storedFileReads.set(source, ticket);
    this.nextRevision(source, true);
    return true;
  }

  /**
   * File and server loads compete for a source (the newest wins), so they share one revision. A
   * server request also passes `"api"` so it is rejected after `invalidateApi`.
   */
  isCurrent(source: SourceId, revision: number, kind: "api" | "file" = "file"): boolean {
    if (this.currentRevision(source) !== revision) return false;
    return kind === "file" || revision > (this.apiFloors.get(source) ?? 0);
  }

  /** Rejects in-flight server requests for a source (its connection changed); file loads continue. */
  invalidateApi(source: SourceId): void {
    this.apiFloors.set(source, this.currentRevision(source));
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
