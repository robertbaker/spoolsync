import { colorFamily } from "../core/color";
import { SOURCE_IDS, type CommonSpool, type LoadResult, type SourceId } from "../core/model";
import { spoolKey } from "./spool-key";

/** A set of spools in one service that look like the same spool entered more than once. */
export interface DuplicateGroup {
  /** Stable id: the service and the lowest-ordered spool id in the group. */
  id: string;
  source: SourceId;
  /** At least two spools, ordered by id (numbers compared as numbers). */
  spools: CommonSpool[];
  /** Plain-language reasons that hold for every pair of linked spools in the group. */
  reasons: string[];
}

/** Remaining weights this close (in grams, or as a share of the larger one) count as identical. */
const WEIGHT_TOLERANCE_GRAMS = 5;
const WEIGHT_TOLERANCE_SHARE = 0.02;

const normalize = (value: string | null): string => value?.trim().toLowerCase() ?? "";

function sameWeight(a: number | null, b: number | null): boolean {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (
    Math.abs(a - b) <= Math.max(WEIGHT_TOLERANCE_GRAMS, WEIGHT_TOLERANCE_SHARE * Math.max(a, b))
  );
}

/** The colour of a spool as a comparable string, or `""` when it has none. */
const colorSignature = (spool: CommonSpool): string =>
  spool.colors.map((color) => colorFamily(color)).join(" + ");

const byId = (a: CommonSpool, b: CommonSpool) =>
  a.sourceId.localeCompare(b.sourceId, undefined, { numeric: true });

/**
 * Why two spools in the same service look like one spool entered twice, or `null` when they do not.
 * Brand, material and colour family must agree and the remaining weights must be near-identical. On
 * top of that the name, purchase date, or lot number must match, so a shelf of unopened spools
 * bought at different times is not flagged just for being full.
 */
function pairReasons(a: CommonSpool, b: CommonSpool): string[] | null {
  if (a.archived !== b.archived) return null;
  const material = normalize(a.material);
  if (!material || material !== normalize(b.material)) return null;
  const vendor = normalize(a.vendor);
  if (vendor !== normalize(b.vendor)) return null;
  const color = colorSignature(a);
  if (color !== colorSignature(b)) return null;
  // Without a brand or a colour there is too little to call two spools the same.
  if (!vendor && !color) return null;
  if (!sameWeight(a.remainingWeight, b.remainingWeight)) return null;

  const evidence: string[] = [];
  const name = normalize(a.name);
  if (name && name === normalize(b.name)) evidence.push(`same name (${a.name?.trim()})`);
  if (a.purchasedOn && a.purchasedOn === b.purchasedOn)
    evidence.push(`same purchase date (${a.purchasedOn})`);
  const lot = normalize(a.lotNr);
  if (lot && lot === normalize(b.lotNr)) evidence.push(`same lot number (${a.lotNr?.trim()})`);
  if (!evidence.length) return null;

  return [
    ...(vendor ? [`same brand (${a.vendor?.trim()})`] : []),
    `same material (${a.material?.trim()})`,
    ...(color ? [`same color family (${color})`] : []),
    a.remainingWeight === b.remainingWeight
      ? `same remaining weight (${Math.round(a.remainingWeight!)} g)`
      : "near-identical remaining weight",
    ...evidence,
  ];
}

/** Keeps the reasons that read the same for every pair, so a group's text is true of all of them. */
function commonReasons(lists: string[][]): string[] {
  const [first = [], ...rest] = lists;
  return first.filter((reason) => rest.every((list) => list.includes(reason)));
}

/**
 * Likely duplicate spools within each loaded service. Report-only: nothing is merged or changed,
 * and spools in different services are never compared (the Sync page handles those). Output order
 * is deterministic: services in their fixed order, groups by their first spool, spools by id.
 */
export function findDuplicateSpools(results: readonly LoadResult[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  for (const source of SOURCE_IDS) {
    const spools = results
      .filter((result) => result.source === source)
      .flatMap((result) => result.spools)
      .sort(byId);
    // Bucketing by material keeps the pairwise comparison cheap for large inventories.
    const buckets = new Map<string, CommonSpool[]>();
    for (const spool of spools) {
      const key = normalize(spool.material);
      if (key) buckets.set(key, [...(buckets.get(key) ?? []), spool]);
    }
    const parent = new Map<CommonSpool, CommonSpool>();
    const root = (spool: CommonSpool): CommonSpool => {
      let current = spool;
      while (parent.has(current)) current = parent.get(current)!;
      return current;
    };
    const pairReasonLists = new Map<CommonSpool, string[][]>();
    const linked = new Set<CommonSpool>();
    for (const bucket of buckets.values())
      for (let i = 0; i < bucket.length; i++)
        for (let j = i + 1; j < bucket.length; j++) {
          const [a, b] = [bucket[i]!, bucket[j]!];
          const reasons = pairReasons(a, b);
          if (!reasons) continue;
          linked.add(a).add(b);
          const [rootA, rootB] = [root(a), root(b)];
          if (rootA !== rootB) parent.set(rootB, rootA);
          for (const spool of [a, b])
            pairReasonLists.set(spool, [...(pairReasonLists.get(spool) ?? []), reasons]);
        }
    const members = new Map<CommonSpool, CommonSpool[]>();
    for (const spool of spools) {
      if (!linked.has(spool)) continue;
      const top = root(spool);
      members.set(top, [...(members.get(top) ?? []), spool]);
    }
    for (const group of members.values()) {
      groups.push({
        id: `${source}:${group[0]!.sourceId}`,
        source,
        spools: group,
        reasons: commonReasons(group.flatMap((spool) => pairReasonLists.get(spool) ?? [])),
      });
    }
  }
  return groups.sort(
    (a, b) =>
      SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source) ||
      byId(a.spools[0]!, b.spools[0]!),
  );
}

/** The keys (`source:id`) of every spool that is part of a duplicate group. */
export function duplicateKeys(groups: readonly DuplicateGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => group.spools.map(spoolKey)));
}
