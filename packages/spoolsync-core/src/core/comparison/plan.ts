import type { SpoolGroup } from "../match";
import { recordKey } from "../matching/keys";
import {
  NATIVE_CROSS_ID,
  WRITABLE_SOURCE_IDS,
  type CommonSpool,
  type ComparableField,
  type CrossIds,
  type SourceId,
} from "../model";
import { applyEditToValues, editedField, type BulkEdit } from "./edits";
import { SOURCE_FIELDS } from "./fields";
import { defaultResolution, mergedValues, presentSources } from "./groups";
import { strictValuesEqual, type RecordEdits } from "./record-edits";
import type { FieldValue, FieldChange, GroupResolution, PlannedChange } from "./types";
import { valuesEqual } from "./values";

const cloneFieldValue = (v: FieldValue): FieldValue => (Array.isArray(v) ? [...v] : v);

const BULK_EDIT_FIELDS = ["location", "comment", "remainingWeight"] as const;

/**
 * Chosen values with accepted cleanups applied. A value taken from a record whose field was cleaned
 * goes out in its cleaned form, to every service, whether it was chosen or filled automatically.
 */
function cleanedValues(
  group: SpoolGroup,
  values: GroupResolution["values"],
  recordEdits: RecordEdits,
): GroupResolution["values"] {
  const cleaned = { ...values };
  for (const key in values) {
    const field = key as ComparableField;
    for (const source of presentSources(group)) {
      const member = group.members[source]!;
      const edited = recordEdits.get(recordKey(member))?.[field];
      if (edited !== undefined && strictValuesEqual(member[field], values[field]!)) {
        cleaned[field] = edited;
        break;
      }
    }
  }
  return cleaned;
}

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
  for (const [key, values] of claims) {
    if (values.size === 1) {
      for (const val of values) {
        (links as Record<string, unknown>)[key] = val;
        break;
      }
    }
  }
  // The loaded service owns its record's identity; foreign cross-IDs cannot override it.
  for (const source of presentSources(group)) {
    const member = group.members[source]!;
    if (source === "bambuddy" && member.crossIds.bambuddyId === undefined) continue;
    const id =
      source === "spoolman" || source === "bambuddy" ? Number(member.sourceId) : member.sourceId;
    if (typeof id === "number" && !Number.isFinite(id)) continue;
    (links as Record<string, unknown>)[NATIVE_CROSS_ID[source]] = id;
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
  filamentDbApp: [],
  spoolmaster: [],
  spoolhoarder: [],
  spoolapp: [],
  spoolkeep: [],
};

/** Cross-ids the target can hold but does not have yet. */
function missingLinks(
  target: CommonSpool | undefined,
  links: CrossIds,
  source: SourceId,
): CrossIds {
  const out: CrossIds = {};
  for (const key of LINKABLE_IDS[source]) {
    if (links[key] !== undefined && target?.crossIds[key] === undefined) {
      (out as Record<string, unknown>)[key] = links[key];
    }
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
  edits: ReadonlyMap<string, BulkEdit> = new Map(),
  recordEdits: RecordEdits = new Map(),
): Map<SourceId, PlannedChange[]> {
  const plan = new Map<SourceId, PlannedChange[]>();
  const push = (change: PlannedChange) => {
    const changes = plan.get(change.source);
    if (changes) changes.push(change);
    else plan.set(change.source, [change]);
  };

  for (const group of groups) {
    const stored = resolutions.get(group.id) ?? defaultResolution(group);
    const resolution = { ...stored, values: cleanedValues(group, stored.values, recordEdits) };
    const links = groupLinks(group);
    const edit = edits.get(group.id);
    for (const source of WRITABLE_SOURCE_IDS) {
      const member = group.members[source];
      if (!member) continue;
      const changes: FieldChange[] = [];
      const targets = new Map<ComparableField, FieldValue>();
      for (const key in resolution.values) {
        targets.set(key as ComparableField, resolution.values[key as ComparableField]!);
      }
      // Accepted record edits (data cleanup) fill fields the person did not resolve themselves.
      const own = recordEdits.get(recordKey(member));
      const ownFields = new Set<ComparableField>();
      if (own) {
        for (const key in own) {
          const to = own[key as ComparableField];
          if (to === undefined) continue;
          const resolved = targets.get(key as ComparableField);
          if (resolved !== undefined && !strictValuesEqual(resolved, to)) continue;
          targets.set(key as ComparableField, to);
          ownFields.add(key as ComparableField);
        }
      }
      // A bulk edit overrides the resolved value; a tag is added to the resolved or member's note.
      for (const field of BULK_EDIT_FIELDS) {
        const edited = editedField(
          edit,
          field,
          targets.has(field) ? targets.get(field)! : member[field],
        );
        if (edited !== undefined) targets.set(field, edited);
      }
      for (const [field, to] of targets) {
        if (!SOURCE_FIELDS[source].has(field) || member.unavailable?.includes(field)) continue;
        // A cleanup must register even when it only changes case or spacing.
        const same =
          ownFields.has(field) && targets.get(field) === own?.[field]
            ? strictValuesEqual(member[field], to)
            : valuesEqual(field, member[field], to);
        if (!same)
          changes.push({ field, from: cloneFieldValue(member[field]), to: cloneFieldValue(to) });
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
        values: applyEditToValues(mergedValues(group, resolution, recordEdits), edit),
        links: missingLinks(undefined, links, source),
        groupIds: links,
      });
    }
  }
  return plan;
}
