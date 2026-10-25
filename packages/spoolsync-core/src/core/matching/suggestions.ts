import type { CommonSpool } from "../model";
import type { Groups } from "./groups";
import { pairKey, recordKey } from "./keys";
import type { RecordKey, MatchSuggestion, MatchingPolicy } from "./types";

interface MatchCandidate extends Omit<MatchSuggestion, "groupIds"> {
  roots: [RecordKey, RecordKey];
}

export function suggestMatches(
  current: Array<[RecordKey, CommonSpool[]]>,
  groups: Pick<Groups, "canUnion">,
  rejected: ReadonlySet<string>,
  idByRoot: ReadonlyMap<RecordKey, string>,
  policy: MatchingPolicy,
): MatchSuggestion[] {
  const candidates: MatchCandidate[] = [];
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const [rootA, membersA] = current[i]!;
      const [rootB, membersB] = current[j]!;
      if (!groups.canUnion(rootA, rootB)) continue;
      let best: MatchCandidate | undefined;
      let blocked = false;
      for (const a of membersA) {
        for (const b of membersB) {
          const pair: [RecordKey, RecordKey] = [recordKey(a), recordKey(b)];
          if (rejected.has(pairKey(...pair))) blocked = true;
          const { score, reasons } = policy.similarity(a, b);
          if (!best || score > best.score) best = { pair, score, reasons, roots: [rootA, rootB] };
        }
      }
      if (!blocked && best && best.score >= policy.suggestionThreshold) candidates.push(best);
    }
  }
  candidates.sort((x, y) => y.score - x.score);

  const suggestions: MatchSuggestion[] = [];
  const used = new Set<RecordKey>();
  for (const {
    roots: [ra, rb],
    ...candidate
  } of candidates) {
    if (used.has(ra) || used.has(rb)) continue;
    used.add(ra);
    used.add(rb);
    suggestions.push({ ...candidate, groupIds: [idByRoot.get(ra)!, idByRoot.get(rb)!] });
  }

  return suggestions;
}
