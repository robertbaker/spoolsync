import type { GroupResolution } from "@spoolsync/core/core/compare";
import { openConflicts } from "@spoolsync/core/core/compare";
import type {
  MatchDecisions,
  MatchResult,
  MatchSuggestion,
  SpoolGroup,
} from "@spoolsync/core/core/match";
import {
  SOURCE_IDS,
  WRITABLE_SOURCE_IDS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import {
  decideMatch,
  ensureResolution,
  findMatches,
  reconcileResolutions,
} from "@spoolsync/core/planner";

const MAX_UNDO = 50;

/** A point in the history: the plan's choices and the answers given to possible matches. */
interface UndoEntry {
  label: string;
  resolutions: Map<string, GroupResolution>;
  decisions: MatchDecisions;
}

export interface SyncPersistence {
  saveResolutions(resolutions: ReadonlyMap<string, GroupResolution>): void;
  saveMatchDecisions(decisions: MatchDecisions): void;
}

export class SyncSession {
  match: MatchResult = { groups: [], suggestions: [], problems: [] };
  filter: "all" | "open" | "missing" = "all";

  constructor(
    readonly loaded: Map<SourceId, LoadResult>,
    private decisions: MatchDecisions,
    public resolutions: Map<string, GroupResolution>,
    private readonly persistence: SyncPersistence,
  ) {}

  loadedSources() {
    return SOURCE_IDS.filter((source) => this.loaded.has(source));
  }
  writableLoadedSources() {
    return WRITABLE_SOURCE_IDS.filter((source) => this.loaded.has(source));
  }
  missingSources(group: SpoolGroup) {
    return this.writableLoadedSources().filter((source) => !group.members[source]);
  }
  pendingGroupIds() {
    return new Set(this.match.suggestions.flatMap((suggestion) => suggestion.groupIds));
  }
  resolutionFor(group: SpoolGroup) {
    return ensureResolution(this.resolutions, group);
  }
  persist() {
    this.persistence.saveResolutions(this.resolutions);
  }

  recompute(): void {
    this.match = findMatches(
      [...this.loaded.values()].flatMap((result) => result.spools),
      this.decisions,
    );
    // Keep choices when a group gains a member after a match or remote creation.
    this.resolutions = reconcileResolutions(this.match.groups, this.resolutions);
    this.persist();
  }

  decide(suggestion: MatchSuggestion, same: boolean): void {
    this.checkpoint(same ? "confirming a match" : "rejecting a match");
    this.decisions = decideMatch(this.decisions, suggestion, same);
    this.persistence.saveMatchDecisions(this.decisions);
  }

  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  /**
   * Remembers the current choices before a change, so the change can be undone. Call it just before
   * mutating `resolutions`. A new change drops anything that could have been redone.
   */
  checkpoint(label: string): void {
    this.undoStack.push(this.snapshot(label));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private snapshot(label: string): UndoEntry {
    return {
      label,
      resolutions: structuredClone(this.resolutions),
      decisions: structuredClone(this.decisions),
    };
  }

  /** Puts back a snapshot's choices and match answers, saving both. */
  private restore(entry: UndoEntry): void {
    this.resolutions = structuredClone(entry.resolutions);
    this.decisions = structuredClone(entry.decisions);
    this.persist();
    this.persistence.saveMatchDecisions(this.decisions);
  }

  /** What undoing would reverse, or `null` when there is nothing to undo. */
  undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  /** Restores the choices from before the last change. Returns its label, or `null` if none. */
  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(this.snapshot(entry.label));
    this.restore(entry);
    return entry.label;
  }

  redo(): string | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(this.snapshot(entry.label));
    this.restore(entry);
    return entry.label;
  }

  /** How many possible matches the visitor has answered, saved across visits. */
  decisionCounts(): { same: number; different: number } {
    return { same: this.decisions.confirmed.length, different: this.decisions.rejected.length };
  }

  /** Forgets every saved match answer so those pairs are suggested again. */
  resetDecisions(): number {
    const { same, different } = this.decisionCounts();
    if (same + different > 0) this.checkpoint("resetting match answers");
    this.decisions = { confirmed: [], rejected: [] };
    this.persistence.saveMatchDecisions(this.decisions);
    return same + different;
  }

  /** Answers every currently suggested pair the same way; the match is recomputed once afterwards. */
  decideAll(same: boolean): number {
    const suggestions = [...this.match.suggestions];
    if (suggestions.length)
      this.checkpoint(
        `${same ? "confirming" : "rejecting"} ${suggestions.length} ${suggestions.length === 1 ? "match" : "matches"}`,
      );
    for (const suggestion of suggestions)
      this.decisions = decideMatch(this.decisions, suggestion, same);
    this.persistence.saveMatchDecisions(this.decisions);
    return suggestions.length;
  }

  visibleGroups(): SpoolGroup[] {
    return this.match.groups.filter((group) => {
      if (this.filter === "open") return openConflicts(group, this.resolutionFor(group)).length > 0;
      if (this.filter === "missing") return this.missingSources(group).length > 0;
      return true;
    });
  }
}
