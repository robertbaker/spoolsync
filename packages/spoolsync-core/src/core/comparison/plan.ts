import type { SpoolGroup } from "../match";
import {
  WRITABLE_SOURCE_IDS,
  type CommonSpool,
  type ComparableField,
  type CrossIds,
  type SourceId,
} from "../model";
import { SOURCE_FIELDS } from "./fields";
import { defaultResolution, mergedValues, presentSources } from "./groups";
import type { FieldValue, FieldChange, GroupResolution, PlannedChange } from "./types";
import { valuesEqual } from "./values";

function groupLinks(group: SpoolGroup): CrossIds {
  const links: CrossIds = {};
  const claims = new Map<keyof CrossIds, Set<string | number>>();
  for (const member of Object.values(group.members)) {
    if (!member) continue;
    for (const [key, value] of Object.entries(member.crossIds) as Array<
      [keyof CrossIds, string | number | undefined]
    >) {
      if (value === undefined) continue;
      const values = claims.get(key) ?? new Set<string | number>();
      values.add(value);
      claims.set(key, values);
    }
  }
  // Do not propagate an arbitrary foreign claim when records disagree.
  for (const [key, values] of claims)
    if (values.size === 1) Object.assign(links, { [key]: [...values][0] });
  const nativeKeys: Record<SourceId, keyof CrossIds> = {
    spoolman: "spoolmanId",
    spoolstock: "spoolstockShortId",
    spoolio: "spoolioId",
    tigertag: "tigertagUid",
    threeDfp: "threeDfpId",
    bambuddy: "bambuddyId",
    filameter: "filameterId",
    filadex: "filadexId",
    filamentdb: "filamentdbSerial",
  };
  // The loaded service owns its record's identity; foreign cross-IDs cannot override it.
  for (const source of presentSources(group)) {
    const member = group.members[source]!;
    const id =
      source === "spoolman" || source === "bambuddy" ? Number(member.sourceId) : member.sourceId;
    if (typeof id === "number" && !Number.isFinite(id)) continue;
    Object.assign(links, { [nativeKeys[source]]: id });
  }
  return links;
}

/**
 * Cross-ids each service can hold for the others. Spoolman has extra fields for them; Spoolio has
 * `spoolmanId` and a batch number; TigerTag records carry `spoolmanId`. A Spoolstock row has only
 * its own short id, so it carries none.
 */
export const LINKABLE_IDS: Record<SourceId, ReadonlyArray<keyof CrossIds>> = {
  spoolman: ["spoolstockShortId", "spoolioId", "tigertagUid"],
  spoolstock: [],
  spoolio: ["spoolmanId", "spoolstockShortId"],
  tigertag: ["spoolmanId"],
  threeDfp: ["spoolmanId"],
  bambuddy: [],
  filameter: [],
  filadex: [],
  filamentdb: [],
};

/** Cross-ids the target can hold but does not have yet. */
function missingLinks(
  target: CommonSpool | undefined,
  links: CrossIds,
  source: SourceId,
): CrossIds {
  const out: CrossIds = {};
  for (const key of LINKABLE_IDS[source]) {
    if (links[key] !== undefined && target?.crossIds[key] === undefined)
      Object.assign(out, { [key]: links[key] });
  }
  return out;
}

/**
 * Turns resolutions into per-service changes. Groups with a pending match suggestion
 * (`pendingGroupIds`) are not created anywhere yet: if the suggestion is right, the spool already
 * exists there.
 */
export function buildPlan(
  groups: SpoolGroup[],
  resolutions: ReadonlyMap<string, GroupResolution>,
  pendingGroupIds: ReadonlySet<string> = new Set(),
): Map<SourceId, PlannedChange[]> {
  const plan = new Map<SourceId, PlannedChange[]>();
  const push = (change: PlannedChange) => {
    const changes = plan.get(change.source);
    if (changes) changes.push(change);
    else plan.set(change.source, [change]);
  };

  for (const group of groups) {
    const resolution = resolutions.get(group.id) ?? defaultResolution(group);
    const links = groupLinks(group);
    for (const source of WRITABLE_SOURCE_IDS) {
      const member = group.members[source];
      if (!member) continue;
      const changes: FieldChange[] = [];
      for (const [field, to] of Object.entries(resolution.values) as Array<
        [ComparableField, FieldValue]
      >) {
        if (!SOURCE_FIELDS[source].has(field)) continue;
        if (!valuesEqual(field, member[field], to))
          changes.push({ field, from: structuredClone(member[field]), to: structuredClone(to) });
      }
      const memberLinks = missingLinks(member, links, source);
      if (changes.length || Object.keys(memberLinks).length) {
        push({
          kind: "update",
          source,
          groupId: group.id,
          spool: member,
          changes,
          links: memberLinks,
        });
      }
    }
    for (const source of WRITABLE_SOURCE_IDS) {
      if (!resolution.createIn.includes(source)) continue;
      if (group.members[source] || pendingGroupIds.has(group.id)) continue;
      push({
        kind: "create",
        source,
        groupId: group.id,
        values: mergedValues(group, resolution),
        links: missingLinks(undefined, links, source),
        groupIds: links,
      });
    }
  }
  return plan;
}
