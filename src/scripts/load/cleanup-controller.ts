import {
  CLEANUP_RULE_IDS,
  acceptedFrom,
  expandBundles,
  proposeCleanup,
  summarizeCleanup,
  type AcceptedCleanup,
  type CleanupProposal,
  type CleanupResult,
  type CleanupRuleId,
  type CleanupSettings,
  type CleanupWarning,
} from "@spoolsync/core/core/cleanup";
import { strictValuesEqual } from "@spoolsync/core/core/compare";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { duplicatesAfterCleanup, type DuplicateGroup } from "@spoolsync/core/workflow";

const MAX_UNDO = 50;

/** Storage the controller reads and writes; the browser supplies localStorage and sessionStorage. */
export interface CleanupStore {
  loadSettings(): CleanupSettings;
  saveSettings(settings: CleanupSettings): void;
  loadAccepted(): AcceptedCleanup[];
  saveAccepted(accepted: readonly AcceptedCleanup[]): void;
}

export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface CleanupFilter {
  rule: CleanupRuleId | "all";
  confidence: "all" | "safe" | "review";
}

export interface CleanupCounts {
  total: number;
  safe: number;
  review: number;
  accepted: number;
  rejected: number;
  pending: number;
  /** Proposals the spool's service cannot take (read-only, or the field is not stored). */
  notApplicable: number;
  warnings: number;
}

interface Checkpoint {
  label: string;
  accepted: Set<string>;
  rejected: Set<string>;
}

const EMPTY: CleanupResult = { proposals: [], warnings: [], rules: [], spoolsChecked: 0 };

/**
 * Holds the state of the "Clean up data" panel: which rules are on, what they propose for the
 * loaded inventories, and which proposals the person accepted or rejected. It owns no DOM and never
 * changes an inventory; accepted proposals are saved for the Sync page to plan. Accepted proposals
 * are remembered with the value they were made for, so a proposal that no longer matches the loaded
 * data is dropped instead of being applied to something it was not made for.
 */
export class CleanupController {
  settings: CleanupSettings;
  result: CleanupResult = EMPTY;
  filter: CleanupFilter = { rule: "all", confidence: "all" };
  /** Accepted entries from earlier visits for services that are not loaded right now. */
  private held: AcceptedCleanup[] = [];
  private stored: AcceptedCleanup[];
  private accepted = new Set<string>();
  private rejected = new Set<string>();
  private undoStack: Checkpoint[] = [];
  private restored = false;
  /** How many saved choices were dropped at the last refresh because the data changed. */
  dropped = 0;

  constructor(
    private readonly results: ReadonlyMap<SourceId, LoadResult>,
    private readonly store: CleanupStore,
    private readonly today: () => string,
  ) {
    this.settings = store.loadSettings();
    this.stored = store.loadAccepted();
  }

  private loadedSources(): Set<SourceId> {
    return new Set(this.results.keys());
  }

  /** Runs the enabled rules over what is loaded and reconciles earlier choices with the result. */
  refresh(): void {
    // Entries to carry over, as they were proposed: saved ones the first time, then the current ones.
    const earlier: AcceptedCleanup[] = this.restored
      ? [...acceptedFrom(this.result.proposals, this.accepted), ...this.held]
      : [...this.stored, ...this.held];
    this.restored = true;
    const spools = [...this.results.values()].flatMap((loaded) => loaded.spools);
    this.result = spools.length
      ? proposeCleanup(spools, { enabled: this.settings.enabled, today: this.today() })
      : EMPTY;
    const byId = new Map(this.result.proposals.map((proposal) => [proposal.id, proposal]));
    const loaded = this.loadedSources();

    // A choice carries over only while it still describes the same change to the same value.
    const active = new Set<string>();
    const held: AcceptedCleanup[] = [];
    let dropped = 0;
    for (const entry of earlier) {
      const source = entry.spoolKey.split(":")[0] as SourceId;
      if (!loaded.has(source)) {
        held.push(entry);
        continue;
      }
      const proposal = byId.get(`${entry.spoolKey}#${entry.field}`);
      if (
        proposal?.applicable &&
        strictValuesEqual(proposal.before, entry.before) &&
        strictValuesEqual(proposal.after, entry.after)
      )
        active.add(proposal.id);
      else dropped += 1;
    }
    // Bundles stand or fall together: if one member dropped out, the others cannot be applied alone.
    /* eslint-disable-next-line unicorn/no-useless-spread */
    for (const id of [...active]) {
      const bundle = byId.get(id)?.bundle;
      if (!bundle || !active.has(id)) continue;
      const members = this.result.proposals.filter((other) => other.bundle === bundle);
      if (members.every((member) => active.has(member.id))) continue;
      for (const member of members) active.delete(member.id);
      dropped += 1;
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
  acceptedEntries(): AcceptedCleanup[] {
    return acceptedFrom(this.result.proposals, this.accepted);
  }

  status(proposal: CleanupProposal): ProposalStatus {
    if (this.accepted.has(proposal.id)) return "accepted";
    return this.rejected.has(proposal.id) ? "rejected" : "pending";
  }

  setFilter(filter: Partial<CleanupFilter>): void {
    this.filter = { ...this.filter, ...filter };
  }

  /** The proposals that pass the rule and confidence filters, in run order. */
  visible(): CleanupProposal[] {
    return this.result.proposals.filter(
      (proposal) =>
        (this.filter.rule === "all" || proposal.rules.includes(this.filter.rule)) &&
        (this.filter.confidence === "all" || proposal.confidence === this.filter.confidence),
    );
  }

  /** Visible proposals grouped by the rule that decided them, in rule order. */
  grouped(): Array<{ rule: CleanupRuleId; proposals: CleanupProposal[] }> {
    const visible = this.visible();
    return CLEANUP_RULE_IDS.flatMap((rule) => {
      const proposals = visible.filter((proposal) => proposal.rule === rule);
      return proposals.length ? [{ rule, proposals }] : [];
    });
  }

  counts(): CleanupCounts {
    const summary = summarizeCleanup(this.result);
    return {
      total: summary.total,
      safe: summary.safe,
      review: summary.review,
      accepted: this.accepted.size,
      rejected: this.rejected.size,
      pending: this.result.proposals.filter(
        (proposal) => proposal.applicable && this.status(proposal) === "pending",
      ).length,
      notApplicable: summary.total - summary.applicable,
      warnings: summary.warnings,
    };
  }

  warnings(): CleanupWarning[] {
    return this.result.warnings;
  }

  /** Likely duplicates that appear once the accepted changes are applied. Report only. */
  newDuplicates(): DuplicateGroup[] {
    return duplicatesAfterCleanup([...this.results.values()], this.acceptedEntries());
  }

  private checkpoint(label: string): void {
    this.undoStack.push({
      label,
      accepted: new Set(this.accepted),
      rejected: new Set(this.rejected),
    });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  /** What undoing would reverse, or `null` when there is nothing to undo. */
  undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.accepted = entry.accepted;
    this.rejected = entry.rejected;
    this.persist();
    return entry.label;
  }

  private choose(ids: Iterable<string>, status: ProposalStatus, label: string): number {
    const known = new Map(this.result.proposals.map((proposal) => [proposal.id, proposal]));
    const wanted = [
      ...expandBundles(
        this.result.proposals,
        [...ids].filter((id) => known.has(id)),
      ),
    ]
      // A change the service cannot take is never accepted; rejecting it is allowed.
      .filter((id) => status !== "accepted" || known.get(id)!.applicable);
    const changed = wanted.filter((id) => {
      const current = this.accepted.has(id)
        ? "accepted"
        : this.rejected.has(id)
          ? "rejected"
          : "pending";
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
    return this.choose(ids, "accepted", "accepting cleanups");
  }

  reject(ids: Iterable<string>): number {
    return this.choose(ids, "rejected", "rejecting cleanups");
  }

  /** Takes a decision back, leaving the proposal pending. */
  reset(ids: Iterable<string>): number {
    return this.choose(ids, "pending", "clearing choices");
  }

  /** Accepts every visible safe proposal a service can take, skipping ones already rejected. */
  acceptAllSafe(): number {
    const ids = this.visible()
      .filter(
        (proposal) =>
          proposal.applicable && proposal.confidence === "safe" && !this.rejected.has(proposal.id),
      )
      .map((proposal) => proposal.id);
    return this.choose(ids, "accepted", `accepting ${ids.length} safe cleanups`);
  }

  /** Forgets every accept and reject. */
  clearChoices(): number {
    const ids = [...this.accepted, ...this.rejected];
    return this.choose(ids, "pending", "clearing all choices");
  }

  setRule(rule: CleanupRuleId, on: boolean): void {
    const enabled = new Set(this.settings.enabled);
    if (on) enabled.add(rule);
    else enabled.delete(rule);
    this.settings = { enabled: CLEANUP_RULE_IDS.filter((id) => enabled.has(id)) };
    this.store.saveSettings(this.settings);
    if (this.filter.rule !== "all" && !enabled.has(this.filter.rule)) this.filter.rule = "all";
    this.refresh();
  }
}
