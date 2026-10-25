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
    this.decisions = decideMatch(this.decisions, suggestion, same);
    this.persistence.saveMatchDecisions(this.decisions);
  }

  visibleGroups(): SpoolGroup[] {
    return this.match.groups.filter((group) => {
      if (this.filter === "open") return openConflicts(group, this.resolutionFor(group)).length > 0;
      if (this.filter === "missing") return this.missingSources(group).length > 0;
      return true;
    });
  }
}
