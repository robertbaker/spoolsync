import type { SpoolGroup } from "../match";
import {
  WRITABLE_SOURCE_IDS,
  type ComparableField,
  type WritableSourceId,
} from "../model";
import { SOURCE_FIELDS } from "./fields";
import type { FieldValue } from "./types";

/**
 * A bulk edit for one group. A property that is `undefined` is not edited. `null` clears the field
 * (the same empty value adapters already read as "no value"); a string sets it.
 *
 * - `location` replaces the storage location.
 * - `note` replaces the notes (the `comment` field).
 * - `tag` adds a `#tag` word to the notes (after any `note` replacement), once.
 * - `remainingWeight` sets the remaining filament in grams (the Load page's weigh-in calculator
 *   stages it). It is always a finite number from 0 up; it can set a weight but never clear one.
 */
export interface BulkEdit {
  location?: string | null;
  note?: string | null;
  tag?: string;
  remainingWeight?: number;
}

export const BULK_EDIT_LIMITS = { location: 200, note: 2000, tag: 40 } as const;
/** Larger than any real spool, so a typo cannot stage an absurd weight. */
export const MAX_EDIT_GRAMS = 100_000;

export const BULK_EDIT_KEYS = ["location", "note", "tag", "remainingWeight"] as const;
export type BulkEditKey = (typeof BULK_EDIT_KEYS)[number];

/** Field each kind of edit writes; used to tell which services take part. */
const BULK_EDIT_FIELDS: Record<BulkEditKey, ComparableField> = {
  location: "location",
  note: "comment",
  tag: "comment",
  remainingWeight: "remainingWeight",
};

/** A tag as stored in notes: no leading `#`, no whitespace or commas, bounded. Empty if unusable. */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, "")
    .replace(/[\s,]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BULK_EDIT_LIMITS.tag);
}

export function isEmptyEdit(edit: BulkEdit | undefined): boolean {
  return !edit || BULK_EDIT_KEYS.every((key) => edit[key] === undefined);
}

/**
 * Cleans one edit from untrusted input (stored data, form fields). Strings are trimmed and capped;
 * a blank location or note string is dropped rather than treated as a clear, so only an explicit
 * `null` clears. Returns `null` when nothing editable remains.
 */
export function sanitizeBulkEdit(raw: unknown): BulkEdit | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const edit: BulkEdit = {};
  for (const key of ["location", "note"] as const) {
    const value = input[key];
    if (value === null) edit[key] = null;
    else if (typeof value === "string") {
      const text = value.trim().slice(0, BULK_EDIT_LIMITS[key]);
      if (text) edit[key] = text;
    }
  }
  if (typeof input["tag"] === "string") {
    const tag = normalizeTag(input["tag"]);
    if (tag) edit.tag = tag;
  }
  const grams = input["remainingWeight"];
  if (typeof grams === "number" && Number.isFinite(grams) && grams >= 0 && grams <= MAX_EDIT_GRAMS)
    edit.remainingWeight = Math.round(grams * 10) / 10;
  return isEmptyEdit(edit) ? null : edit;
}

/** Adds `#tag` to notes unless a `#tag` word (any case) is already there. */
export function addTagToNote(note: FieldValue, tag: string): string {
  const text = typeof note === "string" ? note : "";
  const clean = normalizeTag(tag);
  if (!clean) return text;
  const wanted = `#${clean}`.toLowerCase();
  if (text.split(/\s+/).some((word) => word.toLowerCase() === wanted)) return text;
  return text.trim() ? `${text.replace(/\s+$/, "")} #${clean}` : `#${clean}`;
}

/**
 * The value a field should take under an edit, or `undefined` when the edit leaves it alone.
 * `base` is the note as it would be without the edit: the resolved value or the member's own.
 */
export function editedField(
  edit: BulkEdit | undefined,
  field: ComparableField,
  base: FieldValue,
): FieldValue | undefined {
  if (!edit) return undefined;
  if (field === "location") return edit.location;
  if (field === "remainingWeight") return edit.remainingWeight;
  if (field !== "comment") return undefined;
  if (edit.note === undefined && edit.tag === undefined) return undefined;
  const text: FieldValue = edit.note !== undefined ? edit.note : base;
  return edit.tag === undefined ? text : addTagToNote(text, edit.tag);
}

/** Overlays an edit on a complete set of values (used for spools that will be created). */
export function applyEditToValues<
  T extends { location: FieldValue; comment: FieldValue },
>(values: T, edit: BulkEdit | undefined): T {
  const next = { ...values };
  const location = editedField(edit, "location", next.location);
  if (location !== undefined) next.location = location as T["location"];
  const comment = editedField(edit, "comment", next.comment);
  if (comment !== undefined) next.comment = comment as T["comment"];
  if (edit?.remainingWeight !== undefined && "remainingWeight" in next)
    (next as Record<string, unknown>)["remainingWeight"] = edit.remainingWeight;
  return next;
}

/** Lays a patch over an existing edit; properties set in the patch win. `null` if nothing is left. */
export function mergeBulkEdit(existing: BulkEdit | undefined, patch: BulkEdit): BulkEdit | null {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return sanitizeBulkEdit({ ...existing, ...defined });
}

/** Removes the named parts of an edit; returns `null` when none are left. */
export function withoutBulkEditKeys(
  edit: BulkEdit | undefined,
  keys: readonly BulkEditKey[],
): BulkEdit | null {
  if (!edit) return null;
  const next: BulkEdit = { ...edit };
  for (const key of keys) delete next[key];
  return isEmptyEdit(next) ? null : next;
}

/** Writable services whose adapter stores the field an edit changes. */
export function servicesSupporting(
  key: BulkEditKey,
  loaded: readonly WritableSourceId[] = WRITABLE_SOURCE_IDS,
): WritableSourceId[] {
  return loaded.filter((source) => SOURCE_FIELDS[source].has(BULK_EDIT_FIELDS[key]));
}

/** Whether a group has a member in a writable service that can take some part of the edit. */
export function editReachesGroup(group: SpoolGroup, edit: BulkEdit): boolean {
  return BULK_EDIT_KEYS.some(
    (key) =>
      edit[key] !== undefined &&
      WRITABLE_SOURCE_IDS.some(
        (source) => group.members[source] && SOURCE_FIELDS[source].has(BULK_EDIT_FIELDS[key]),
      ),
  );
}

/** Short description, e.g. `location "Shelf A", tag #dry`. */
export function describeBulkEdit(edit: BulkEdit): string {
  const parts: string[] = [];
  if (edit.location !== undefined)
    parts.push(edit.location === null ? "clear location" : `location "${edit.location}"`);
  if (edit.note !== undefined)
    parts.push(edit.note === null ? "clear note" : `note "${edit.note}"`);
  if (edit.tag !== undefined) parts.push(`tag #${edit.tag}`);
  if (edit.remainingWeight !== undefined) parts.push(`remaining ${edit.remainingWeight} g`);
  return parts.join(", ");
}
