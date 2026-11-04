import { strictValuesEqual } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import {
  NO_REFERENCE,
  ReferenceCatalog,
  ReferenceFetchError,
  acceptedReferences,
  analyzeReference,
  buildFetchConfig,
  cacheKey,
  fetchReferenceCatalog,
  hasColorProblem,
  isFresh,
  mappingOverrides,
  needsChoice,
  parseReferenceFile,
  providerById,
  ttlMs,
  type AcceptedReference,
  type FetchProgress,
  type ProviderSettings,
  type ReferenceAnalysis,
  type ReferenceCacheEntry,
  type ReferenceFilament,
  type ReferenceIO,
  type ReferenceItem,
  type ReferenceMapping,
  type ReferencePolicy,
  type ReferenceProposal,
  type ReferenceProviderId,
  type ReferenceSettings,
  type ReferenceSummary,
} from "@spoolsync/core/core/reference";

const MAX_UNDO = 50;

/** Storage the controller reads and writes; the browser supplies localStorage and sessionStorage. */
export interface ReferenceStore {
  loadSettings(): ReferenceSettings;
  saveSettings(settings: ReferenceSettings): void;
  loadAccepted(): AcceptedReference[];
  saveAccepted(accepted: readonly AcceptedReference[]): void;
  loadChoices(): Map<string, string>;
  saveChoices(choices: ReadonlyMap<string, string>): void;
  loadCache(): Record<string, ReferenceCacheEntry>;
  saveCache(entry: ReferenceCacheEntry): boolean;
  clearCache(providerId?: string): void;
}

export type ProposalStatus = "pending" | "accepted" | "rejected";
export type ReferenceFilter = "all" | "missing" | "differs" | "color" | "ambiguous" | "unmatched";

export const FILTERS: ReadonlyArray<readonly [ReferenceFilter, string]> = [
  ["all", "Everything to review"],
  ["missing", "Missing data"],
  ["differs", "Differs"],
  ["color", "Color check"],
  ["ambiguous", "Needs a choice"],
  ["unmatched", "No match"],
];

/** Where the catalog in use came from, and the credit line that goes with it. */
export interface CatalogInfo {
  providerId: ReferenceProviderId;
  providerLabel: string;
  attribution: string;
  license: string | null;
  /** The file name, or the endpoint's host. */
  name: string;
  origin: "file" | "fetch" | "cache";
  records: number;
  usable: number;
  skipped: number;
  warnings: string[];
  /** Milliseconds since the epoch. */
  loadedAt: number;
}

export type FetchOutcome =
  | { kind: "ok"; info: CatalogInfo }
  | { kind: "stale" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "error"; message: string; cancelled: boolean };

export interface ReferenceCounts extends ReferenceSummary {
  accepted: number;
  rejected: number;
  /** Proposals nobody has decided that a service could take. */
  pending: number;
  notApplicable: number;
  /** Spools still waiting for a choice among several records. */
  needChoice: number;
  /** Spools whose reference matches on every field they share. */
  inSync: number;
}

interface Checkpoint {
  label: string;
  accepted: Set<string>;
  rejected: Set<string>;
  choices: Map<string, string>;
}

const EMPTY: ReferenceAnalysis = {
  items: [],
  proposals: [],
  summary: {
    spools: 0,
    matched: 0,
    ambiguous: 0,
    suggested: 0,
    unmatched: 0,
    withMissing: 0,
    withDifferences: 0,
    colorMismatches: 0,
    colorClose: 0,
    proposals: 0,
    safe: 0,
    review: 0,
    applicable: 0,
  },
};

/** Identifies the endpoint and mapping a catalog came from, so a changed setting misses the cache. */
const keyFor = (config: {
  urlTemplate: string;
  mapping: ReferenceMapping;
  pagination: unknown;
}): string =>
  cacheKey({
    urlTemplate: config.urlTemplate,
    mapping: mappingOverrides(config.mapping),
    pagination: config.pagination,
  });

const hasColorFlag = (item: ReferenceItem) =>
  hasColorProblem(item) || item.color?.verdict === "close";

/**
 * Holds the state of the "Reference data" panel: the catalog in use, what it says about each
 * loaded spool, and which proposed changes the person accepted or rejected. It owns no DOM and
 * never changes an inventory; accepted proposals are saved for the Sync page to plan, each with
 * the value it was made for, so one that no longer matches the loaded data is dropped instead of
 * being applied to something it was not made for.
 *
 * Loading a catalog, from a file or the network, is guarded by a request revision: a newer load
 * (or `cancel()`) makes every older response stale, and a stale response is discarded without
 * touching state.
 */
export class ReferenceController {
  settings: ReferenceSettings;
  catalog: ReferenceCatalog | null = null;
  info: CatalogInfo | null = null;
  analysis: ReferenceAnalysis = EMPTY;
  filter: ReferenceFilter = "all";
  /** Saved choices dropped at the last refresh because the data changed. */
  dropped = 0;
  /** Progress of a fetch in flight, or `null`. */
  progress: FetchProgress | null = null;
  private revision = 0;
  private abort: AbortController | null = null;
  private held: AcceptedReference[] = [];
  private stored: AcceptedReference[];
  private accepted = new Set<string>();
  private rejected = new Set<string>();
  private choices: Map<string, string>;
  private undoStack: Checkpoint[] = [];
  private restored = false;

  constructor(
    private readonly results: ReadonlyMap<SourceId, LoadResult>,
    private readonly store: ReferenceStore,
    private readonly io: ReferenceIO,
  ) {
    this.settings = store.loadSettings();
    this.stored = store.loadAccepted();
    this.choices = store.loadChoices();
  }

  get policy(): ReferencePolicy {
    return this.settings.policy;
  }

  /** Whether a fetch is running. */
  get busy(): boolean {
    return this.abort !== null;
  }

  private spools() {
    return [...this.results.values()].flatMap((loaded) => loaded.spools);
  }

  private analyze(): void {
    const spools = this.spools();
    this.analysis =
      this.catalog && spools.length
        ? analyzeReference(spools, this.catalog, { policy: this.policy, choices: this.choices })
        : EMPTY;
  }

  /**
   * Re-analyses what is loaded and reconciles earlier choices with the result. Call it whenever
   * the inventories, the catalog, or the policy change.
   */
  refresh(): void {
    const earlier: AcceptedReference[] = this.restored
      ? [...acceptedReferences(this.analysis.proposals, this.accepted), ...this.held]
      : [...this.stored, ...this.held];
    this.restored = true;
    this.analyze();

    // A saved pick of a record only means something while the spool and that candidate remain.
    const loadedSources = new Set<SourceId>(this.results.keys());
    const byKey = new Map(this.analysis.items.map((item) => [item.spoolKey, item] as const));
    let pruned = false;
    for (const [key, referenceId] of [...this.choices]) {
      const source = key.split(":")[0] as SourceId;
      if (!loadedSources.has(source) || !this.catalog) continue;
      const item = byKey.get(key);
      const stale =
        !item ||
        (referenceId !== NO_REFERENCE &&
          !item.match.candidates.some((candidate) => candidate.reference.id === referenceId));
      if (stale) {
        this.choices.delete(key);
        pruned = true;
      }
    }
    if (pruned) {
      this.analyze();
      this.store.saveChoices(this.choices);
    }

    const byId = new Map(this.analysis.proposals.map((proposal) => [proposal.id, proposal]));
    const active = new Set<string>();
    const held: AcceptedReference[] = [];
    let dropped = 0;
    for (const entry of earlier) {
      const source = entry.spoolKey.split(":")[0] as SourceId;
      // Without a catalog nothing can be checked, and a service that is not loaded cannot be
      // judged either: keep the choice for when it can.
      if (!this.catalog || !loadedSources.has(source)) {
        held.push(entry);
        continue;
      }
      const proposal = byId.get(`${entry.spoolKey}#${entry.field}`);
      if (
        proposal?.applicable &&
        proposal.referenceId === entry.referenceId &&
        proposal.providerId === entry.providerId &&
        strictValuesEqual(proposal.before, entry.before) &&
        strictValuesEqual(proposal.after, entry.after)
      )
        active.add(proposal.id);
      else dropped += 1;
    }
    this.accepted = active;
    this.rejected = new Set([...this.rejected].filter((id) => byId.has(id) && !active.has(id)));
    this.held = held;
    this.dropped = dropped;
    this.stored = [];
    this.persist();
  }

  private persist(): void {
    this.store.saveAccepted([...this.acceptedEntries(), ...this.held]);
  }

  /** Accepted changes as the Sync page plans them. */
  acceptedEntries(): AcceptedReference[] {
    return acceptedReferences(this.analysis.proposals, this.accepted);
  }

  /** Accepted changes kept for services or catalogs that are not loaded right now. */
  heldCount(): number {
    return this.held.length;
  }

  status(proposal: ReferenceProposal): ProposalStatus {
    if (this.accepted.has(proposal.id)) return "accepted";
    return this.rejected.has(proposal.id) ? "rejected" : "pending";
  }

  // ---- Catalog loading ----------------------------------------------------------------------

  private setCatalog(filaments: readonly ReferenceFilament[], info: CatalogInfo): void {
    this.catalog = new ReferenceCatalog(filaments);
    this.info = info;
    // A different catalog is a different set of records; earlier picks and accepted changes are
    // re-checked against it in `refresh`, which drops what no longer fits.
    this.refresh();
  }

  /** Newer loads make older ones stale. */
  private begin(): { revision: number; signal: AbortSignal } {
    this.abort?.abort();
    this.revision += 1;
    this.abort = new AbortController();
    return { revision: this.revision, signal: this.abort.signal };
  }

  /** Stops a fetch in flight; its response, if one still arrives, is ignored. */
  cancel(): void {
    this.revision += 1;
    this.abort?.abort();
    this.abort = null;
    this.progress = null;
  }

  /** Reads a reference file. Throws with a plain message when the file is unusable. */
  loadFile(name: string, text: string): CatalogInfo {
    this.cancel();
    const parsed = parseReferenceFile(name, text);
    const info: CatalogInfo = {
      providerId: "file",
      providerLabel: "Reference file",
      attribution: parsed.attribution,
      license: parsed.license,
      name,
      origin: "file",
      records: parsed.records,
      usable: parsed.filaments.length,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      loadedAt: this.io.now(),
    };
    this.setCatalog(parsed.filaments, info);
    return info;
  }

  /** The catalog in use is dropped; earlier accepted changes are held until one is loaded again. */
  unload(): void {
    this.cancel();
    this.catalog = null;
    this.info = null;
    this.refresh();
  }

  /** The fresh cached catalog for a provider's current settings, if there is one. */
  cached(providerId: ReferenceProviderId): ReferenceCacheEntry | null {
    const built = buildFetchConfig(providerId, this.settings.providers[providerId]);
    if (!built.ok) return null;
    const entry = this.store.loadCache()[providerId];
    if (!entry || entry.key !== keyFor(built.config)) return null;
    return isFresh(entry, this.io.now()) ? entry : null;
  }

  /**
   * Fetches a provider's catalog in the browser, or reuses a cached copy that is still fresh
   * (`force` fetches anyway). Only the latest request is applied.
   */
  async fetchProvider(
    providerId: ReferenceProviderId,
    options: { force?: boolean; onProgress?: (progress: FetchProgress) => void } = {},
  ): Promise<FetchOutcome> {
    const provider = providerById(providerId);
    const settings = this.settings.providers[providerId];
    const built = buildFetchConfig(providerId, settings);
    if (!provider || !built.ok) return { kind: "invalid", errors: built.ok ? ["Unknown provider."] : built.errors };
    const key = keyFor(built.config);
    const host = new URL(built.config.urlTemplate.replace(/\{(offset|page|limit)\}/g, "0")).host;

    if (!options.force) {
      const entry = this.store.loadCache()[providerId];
      if (entry && entry.key === key && isFresh(entry, this.io.now())) {
        this.cancel();
        this.setCatalog(entry.filaments, {
          providerId,
          providerLabel: provider.info.label,
          attribution: entry.attribution,
          license: entry.license,
          name: host,
          origin: "cache",
          records: entry.filaments.length,
          usable: entry.filaments.length,
          skipped: 0,
          warnings: [],
          loadedAt: entry.fetchedAt,
        });
        return { kind: "ok", info: this.info! };
      }
    }

    const { revision, signal } = this.begin();
    this.progress = { pages: 0, records: 0 };
    try {
      const fetched = await fetchReferenceCatalog(provider, built.config, this.io, {
        signal,
        onProgress: (progress) => {
          if (revision !== this.revision) return;
          this.progress = progress;
          options.onProgress?.(progress);
        },
      });
      if (revision !== this.revision) return { kind: "stale" };
      this.abort = null;
      this.progress = null;
      const info: CatalogInfo = {
        providerId,
        providerLabel: provider.info.label,
        attribution: fetched.attribution,
        license: fetched.license,
        name: host,
        origin: "fetch",
        records: fetched.filaments.length + fetched.skipped,
        usable: fetched.filaments.length,
        skipped: fetched.skipped,
        warnings: fetched.warnings,
        loadedAt: fetched.fetchedAt,
      };
      this.setCatalog(fetched.filaments, info);
      this.store.saveCache({
        providerId,
        key,
        fetchedAt: fetched.fetchedAt,
        ttlMs: ttlMs(settings?.ttlHours ?? 24),
        attribution: fetched.attribution,
        license: fetched.license,
        filaments: fetched.filaments,
      });
      return { kind: "ok", info };
    } catch (error) {
      if (revision !== this.revision) return { kind: "stale" };
      this.abort = null;
      this.progress = null;
      const cancelled = error instanceof ReferenceFetchError && error.kind === "aborted";
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        cancelled,
      };
    }
  }

  // ---- Settings -----------------------------------------------------------------------------

  private saveSettings(): void {
    this.store.saveSettings(this.settings);
  }

  setProvider(providerId: ReferenceProviderId): void {
    this.settings = { ...this.settings, providerId };
    this.saveSettings();
  }

  saveProviderSettings(providerId: ReferenceProviderId, provider: ProviderSettings): void {
    this.settings = {
      ...this.settings,
      providers: { ...this.settings.providers, [providerId]: provider },
    };
    this.saveSettings();
  }

  /** Changes which fields may be touched and which may overwrite; proposals are recomputed. */
  setPolicy(policy: ReferencePolicy): void {
    this.settings = { ...this.settings, policy };
    this.saveSettings();
    this.refresh();
  }

  setFilter(filter: ReferenceFilter): void {
    this.filter = filter;
  }

  // ---- What to show -------------------------------------------------------------------------

  /** Whether a spool has anything to show: a proposal, a color flag, or a choice to make. */
  private notable(item: ReferenceItem): boolean {
    return (
      item.proposals.length > 0 ||
      item.diffs.some((diff) => diff.status !== "same") ||
      hasColorFlag(item) ||
      needsChoice(item)
    );
  }

  private passes(item: ReferenceItem, filter: ReferenceFilter): boolean {
    switch (filter) {
      case "missing":
        return item.diffs.some((diff) => diff.status === "missing");
      case "differs":
        return item.diffs.some((diff) => diff.status === "differs");
      case "color":
        return hasColorFlag(item);
      case "ambiguous":
        return needsChoice(item);
      case "unmatched":
        return item.match.status === "none";
      default:
        return this.notable(item);
    }
  }

  visible(): ReferenceItem[] {
    return this.analysis.items.filter((item) => this.passes(item, this.filter));
  }

  counts(): ReferenceCounts {
    const proposals = this.analysis.proposals;
    return {
      ...this.analysis.summary,
      accepted: this.accepted.size,
      rejected: this.rejected.size,
      pending: proposals.filter((p) => p.applicable && this.status(p) === "pending").length,
      notApplicable: proposals.filter((p) => !p.applicable).length,
      needChoice: this.analysis.items.filter(needsChoice).length,
      inSync: this.analysis.items.filter((item) => item.selected && !this.notable(item)).length,
    };
  }

  /** Number of spools per filter, so the chips can show what each would list. */
  filterCounts(): Record<ReferenceFilter, number> {
    const out = {} as Record<ReferenceFilter, number>;
    for (const [filter] of FILTERS)
      out[filter] = this.analysis.items.filter((item) => this.passes(item, filter)).length;
    return out;
  }

  // ---- Choices ------------------------------------------------------------------------------

  private checkpoint(label: string): void {
    this.undoStack.push({
      label,
      accepted: new Set(this.accepted),
      rejected: new Set(this.rejected),
      choices: new Map(this.choices),
    });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.accepted = entry.accepted;
    this.rejected = entry.rejected;
    this.choices = entry.choices;
    this.analyze();
    this.store.saveChoices(this.choices);
    this.persist();
    return entry.label;
  }

  private decide(ids: Iterable<string>, status: ProposalStatus, label: string): number {
    const known = new Map(this.analysis.proposals.map((proposal) => [proposal.id, proposal]));
    const wanted = [...new Set(ids)]
      .filter((id) => known.has(id))
      // A change the service cannot take is never accepted; rejecting it is allowed.
      .filter((id) => status !== "accepted" || known.get(id)!.applicable);
    const changed = wanted.filter((id) => {
      const current = this.accepted.has(id) ? "accepted" : this.rejected.has(id) ? "rejected" : "pending";
      return current !== status;
    });
    if (!changed.length) return 0;
    this.checkpoint(label);
    for (const id of changed) {
      this.accepted.delete(id);
      this.rejected.delete(id);
      if (status === "accepted") this.accepted.add(id);
      if (status === "rejected") this.rejected.add(id);
    }
    this.persist();
    return changed.length;
  }

  accept(ids: Iterable<string>): number {
    return this.decide(ids, "accepted", "accepting reference data");
  }

  reject(ids: Iterable<string>): number {
    return this.decide(ids, "rejected", "rejecting reference data");
  }

  reset(ids: Iterable<string>): number {
    return this.decide(ids, "pending", "clearing choices");
  }

  private visibleProposals(kind: ReferenceProposal["kind"]): ReferenceProposal[] {
    return this.visible()
      .flatMap((item) => item.proposals)
      .filter(
        (proposal) =>
          proposal.kind === kind &&
          proposal.applicable &&
          this.status(proposal) === "pending",
      );
  }

  /** Accepts every undecided fill in view: a missing value the reference supplies. */
  fillAllMissing(): number {
    const ids = this.visibleProposals("fill").map((p) => p.id);
    return this.decide(ids, "accepted", `filling ${ids.length} missing values`);
  }

  /** Accepts every undecided overwrite in view, for the fields chosen to allow overwriting. */
  overwriteSelected(): number {
    const ids = this.visibleProposals("overwrite").map((p) => p.id);
    return this.decide(ids, "accepted", `overwriting ${ids.length} values`);
  }

  clearChoices(): number {
    const ids = [...this.accepted, ...this.rejected];
    return this.decide(ids, "pending", "clearing all choices");
  }

  /**
   * Picks which reference record a spool is tied to (or `NO_REFERENCE` for none). Accepted
   * changes that were made from a different record are dropped.
   */
  chooseReference(spoolKey: string, referenceId: string): boolean {
    const item = this.analysis.items.find((candidate) => candidate.spoolKey === spoolKey);
    if (!item) return false;
    if (
      referenceId !== NO_REFERENCE &&
      !item.match.candidates.some((candidate) => candidate.reference.id === referenceId)
    )
      return false;
    if (this.choices.get(spoolKey) === referenceId) return false;
    this.checkpoint(referenceId === NO_REFERENCE ? "choosing no match" : "choosing a reference");
    this.choices.set(spoolKey, referenceId);
    this.afterChoiceChange();
    return true;
  }

  /** Goes back to the matcher's own answer for the spool. */
  clearReference(spoolKey: string): boolean {
    if (!this.choices.has(spoolKey)) return false;
    this.checkpoint("clearing a choice");
    this.choices.delete(spoolKey);
    this.afterChoiceChange();
    return true;
  }

  private afterChoiceChange(): void {
    this.store.saveChoices(this.choices);
    // What each accepted change was made from, read before the proposals are recomputed.
    const previous = new Map(
      this.acceptedEntries().map((entry) => [`${entry.spoolKey}#${entry.field}`, entry] as const),
    );
    this.analyze();
    const byId = new Map(this.analysis.proposals.map((proposal) => [proposal.id, proposal]));
    const stillValid = (id: string, entry?: AcceptedReference) => {
      const proposal = byId.get(id);
      return Boolean(
        proposal &&
          (!entry ||
            (proposal.referenceId === entry.referenceId &&
              strictValuesEqual(proposal.after, entry.after))),
      );
    };
    this.accepted = new Set([...this.accepted].filter((id) => stillValid(id, previous.get(id))));
    this.rejected = new Set([...this.rejected].filter((id) => byId.has(id)));
    this.persist();
  }

  /** The reference record a spool is tied to right now, if any. */
  selectedFor(spoolKey: string): ReferenceItem["selected"] {
    return this.analysis.items.find((item) => item.spoolKey === spoolKey)?.selected ?? null;
  }
}
