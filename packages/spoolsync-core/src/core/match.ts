export type {
  RecordKey,
  MatchDecisions,
  MatchSuggestion,
  SpoolGroup,
  MatchResult,
  SimilarityResult,
  MatchingPolicy,
} from "./matching/types";
export { recordKey, groupKey, pairKey } from "./matching/keys";
export { similarity, SUGGEST_THRESHOLD } from "./matching/similarity";
export { matchSpools } from "./matching/matcher";
