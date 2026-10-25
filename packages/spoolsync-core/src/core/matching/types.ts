import type { CommonSpool, SourceId } from "../model";

export type RecordKey = string;

export interface MatchDecisions {
  /** Pairs the user said are the same spool. */
  confirmed: string[];
  /** Pairs the user said are different spools; never suggested again. */
  rejected: string[];
}

export interface MatchSuggestion {
  /** The two most alike records, one from each group. */
  pair: [RecordKey, RecordKey];
  /** The two groups that would merge. */
  groupIds: [string, string];
  score: number;
  reasons: string[];
}

export interface SpoolGroup {
  /** Stable for the same members: their sorted keys. */
  id: string;
  members: Partial<Record<SourceId, CommonSpool>>;
  /** Linked: several services, joined by cross-ids or the user's confirmation. single: one service. */
  status: "linked" | "single";
}

export interface MatchResult {
  groups: SpoolGroup[];
  /**
   * Groups that look like the same spool, for the user to confirm or reject. Both groups stay as
   * they are until then, so id-linked data is never held back by a guess. A group is in at most
   * one.
   */
  suggestions: MatchSuggestion[];
  /** Cross-ids claimed by records that cannot all be one spool. */
  problems: string[];
}

export interface SimilarityResult {
  score: number;
  reasons: string[];
}

/** Fuzzy scoring only affects suggestions; identity links retain their fixed rules. */
export interface MatchingPolicy {
  similarity(a: CommonSpool, b: CommonSpool): SimilarityResult;
  suggestionThreshold: number;
}
