import {
  BULK_EDIT_LIMITS,
  normalizeTag,
  sanitizeBulkEdit,
  type BulkEdit,
} from "@spoolsync/core/core/compare";

/** What the bulk-edit form holds: text boxes plus a "clear" box for the two replaceable fields. */
export interface BulkEditFormValues {
  location: string;
  clearLocation: boolean;
  note: string;
  clearNote: boolean;
  tag: string;
}

export type BulkEditFormResult = { patch: BulkEdit } | { error: string };

/**
 * Turns form values into an edit. A blank box means "leave it alone"; only the explicit clear box
 * writes an empty value. A box and its clear box together are ambiguous, so they are refused.
 */
export function bulkEditFromForm(values: BulkEditFormValues): BulkEditFormResult {
  const location = values.location.trim();
  const note = values.note.trim();
  const rawTag = values.tag.trim();
  if (location && values.clearLocation)
    return { error: "Enter a location or tick Clear location, not both." };
  if (note && values.clearNote) return { error: "Enter a note or tick Clear note, not both." };
  if (location.length > BULK_EDIT_LIMITS.location)
    return { error: `Location is limited to ${BULK_EDIT_LIMITS.location} characters.` };
  if (note.length > BULK_EDIT_LIMITS.note)
    return { error: `Note is limited to ${BULK_EDIT_LIMITS.note} characters.` };
  if (rawTag && !normalizeTag(rawTag)) return { error: "That tag has no usable characters." };
  if (rawTag.length > BULK_EDIT_LIMITS.tag)
    return { error: `Tag is limited to ${BULK_EDIT_LIMITS.tag} characters.` };
  const patch = sanitizeBulkEdit({
    location: values.clearLocation ? null : location,
    note: values.clearNote ? null : note,
    tag: rawTag,
  });
  return patch
    ? { patch }
    : { error: "Enter a location, note or tag to set, or tick a Clear box." };
}

/** Plain-English result line used for the status region and the toast. */
export function bulkEditResult(changed: number, selected: number): string {
  if (selected === 0) return "Select at least one spool first.";
  if (changed === 0) return "Nothing changed: the selected spools already have these edits.";
  return `Bulk edit added to ${changed} ${changed === 1 ? "spool" : "spools"}.`;
}
