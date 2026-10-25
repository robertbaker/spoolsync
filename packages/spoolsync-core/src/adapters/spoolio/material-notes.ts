import { toText } from "../../core/normalize";

// Spoolio canonicalizes these types on restore. Keep the richer material in its supported notes
// field, so both the user and a later sync can recover it without relying on unknown JSON keys.
export const MATERIAL_TYPES: Record<string, string> = {
  "PLA-Glow": "PLA",
  "PETG+": "PETG",
  "PA6-CF": "PA-CF",
};
const MATERIAL_NOTE = /^\[Original material: (PLA-Glow|PETG\+|PA6-CF)\]\n?/;
export function materialNote(notes: unknown): string | undefined {
  return typeof notes === "string" ? MATERIAL_NOTE.exec(notes)?.[1] : undefined;
}
export function notesText(notes: unknown): string | null {
  return toText(typeof notes === "string" ? notes.replace(MATERIAL_NOTE, "") : notes);
}
export function setNotes(
  target: Record<string, unknown>,
  comment: unknown,
  material?: string,
): void {
  const text = notesText(comment) ?? "";
  const notes = `${material ? `[Original material: ${material}]\n` : ""}${text}`.trimEnd();
  if (notes) target["notes"] = notes;
  else delete target["notes"];
}
