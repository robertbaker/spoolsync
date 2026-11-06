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
  // Keys are built once per record, not once per compared pair.
  const keysByGroup = current.map(([, members]) => members.map(recordKey));
  const hasRejected = rejected.size > 0;
  const { score: fastScore, scoreUpperBound } = policy;
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const [rootA, membersA] = current[i]!;
      const [rootB, membersB] = current[j]!;
      if (!groups.canUnion(rootA, rootB)) continue;
      const keysA = keysByGroup[i]!;
      const keysB = keysByGroup[j]!;
      let best: { a: number; b: number; score: number; reasons?: string[] } | undefined;
      let blocked = false;
      for (let a = 0; a < membersA.length; a++) {
        for (let b = 0; b < membersB.length; b++) {
          if (hasRejected && rejected.has(pairKey(keysA[a]!, keysB[b]!))) {
            blocked = true;
            break;
          }
          const specA = membersA[a]!;
          const specB = membersB[b]!;
          if (fastScore) {
            // A pair that cannot beat the best so far (ties keep the earlier pair) or reach the
            // threshold can never be the one reported, so skip scoring it.
            if (scoreUpperBound) {
              const bound = scoreUpperBound(specA, specB);
              if (bound < policy.suggestionThreshold || (best && bound <= best.score)) continue;
            }
            const score = fastScore(specA, specB);
            if (!best || score > best.score) best = { a, b, score };
          } else {
            const { score, reasons } = policy.similarity(specA, specB);
            if (!best || score > best.score) best = { a, b, score, reasons };
          }
        }
        if (blocked) break;
      }
      if (!blocked && best && best.score >= policy.suggestionThreshold) {
        // Only the winning pair needs its reason text.
        const reasons =
          best.reasons ?? policy.similarity(membersA[best.a]!, membersB[best.b]!).reasons;
        candidates.push({
          pair: [keysA[best.a]!, keysB[best.b]!],
          score: best.score,
          reasons,
          roots: [rootA, rootB],
        });
      }
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
