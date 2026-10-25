import { SOURCE_IDS, type CommonSpool } from "../model";
import { Groups } from "./groups";
import { linkIdentityClaims } from "./identity";
import { groupKey, recordKey } from "./keys";
import { defaultMatchingPolicy } from "./similarity";
import { suggestMatches } from "./suggestions";
import type { RecordKey, MatchDecisions, MatchResult, SpoolGroup, MatchingPolicy } from "./types";

/**
 * Groups records that are the same physical spool, one record per service at most.
 *
 * 1. Cross-ids the tools already stamp (Spoolman id, Spoolstock short id, …) link records outright.
 * 2. Pairs the user confirmed are linked too.
 * 3. Groups that could still merge are compared field by field; the best pairs above
 *    {@link SUGGEST_THRESHOLD} become suggestions for the user to confirm or reject. Suggestions do
 *    not merge anything themselves. Rejected pairs are never suggested again.
 */
export function matchSpools(
  spools: CommonSpool[],
  decisions: MatchDecisions = { confirmed: [], rejected: [] },
  policy: MatchingPolicy = defaultMatchingPolicy,
): MatchResult {
  // Stable traversal also makes equal-score suggestions independent of input file order.
  spools = [...spools].sort((a, b) => {
    const source = SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source);
    if (source) return source;
    return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
  });
  const byKey = new Map<RecordKey, CommonSpool>();
  for (const spool of spools) {
    const key = recordKey(spool);
    if (byKey.has(key))
      throw new Error(
        `Duplicate inventory record: ${key}. Each source record must have a unique ID.`,
      );
    byKey.set(key, spool);
  }
  const groups = new Groups(spools);
  const problems = linkIdentityClaims(spools, byKey, groups);

  for (const pair of decisions.confirmed) {
    const [a, b] = pair.split("|");
    if (a && b && byKey.has(a) && byKey.has(b) && !groups.union(a, b))
      problems.push(
        `Could not confirm ${a},${b}: linking these groups would put multiple records from the same source together.`,
      );
  }

  // Fuzzy suggestions between groups that do not share a service.
  const rejected = new Set(decisions.rejected);
  const roots = () => {
    const members = new Map<RecordKey, CommonSpool[]>();
    for (const spool of spools) {
      const root = groups.find(recordKey(spool));
      const existing = members.get(root);
      if (existing) existing.push(spool);
      else members.set(root, [spool]);
    }
    return members;
  };
  const current = [...roots()];
  const groupId = (members: CommonSpool[]) => groupKey(members.map(recordKey));
  const result: SpoolGroup[] = [];
  const idByRoot = new Map<RecordKey, string>();
  for (const [root, members] of current) {
    const bySource: SpoolGroup["members"] = {};
    for (const member of members) bySource[member.source] = member;
    const id = groupId(members);
    idByRoot.set(root, id);
    result.push({ id, members: bySource, status: members.length > 1 ? "linked" : "single" });
  }

  const suggestions = suggestMatches(current, groups, rejected, idByRoot, policy);

  const order = (group: SpoolGroup) => SOURCE_IDS.findIndex((source) => group.members[source]);
  result.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
  return { groups: result, suggestions, problems };
}
