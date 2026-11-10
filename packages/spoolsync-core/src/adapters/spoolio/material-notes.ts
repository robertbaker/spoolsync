import { toText } from "../../core/normalize";

// Spoolio canonicalizes these types on restore. Keep the richer material in its supported notes
// field, so both the user and a later sync can recover it without relying on unknown JSON keys.
export { MATERIAL_TYPES } from "../../core/material";
// `batchNumber` normally carries the Spoolstock link; a real lot number moves the link here.
const NOTE_TAGS =
  /^(?:\[Original material: (PLA-Glow|PETG\+|PA6-CF)\]\n?)?(?:\[Spoolstock link: ([^\]\n]+)\]\n?)?/;
export function materialNote(notes: unknown): string | undefined {
  return typeof notes === "string" ? NOTE_TAGS.exec(notes)?.[1] : undefined;
}
export function spoolstockLinkNote(notes: unknown): string | undefined {
  return typeof notes === "string" ? NOTE_TAGS.exec(notes)?.[2] : undefined;
}
export function notesText(notes: unknown): string | null {
  return toText(typeof notes === "string" ? notes.replace(NOTE_TAGS, "") : notes);
}
export function setNotes(
  target: Record<string, unknown>,
  comment: unknown,
  material?: string,
  link: string | undefined = spoolstockLinkNote(target["notes"]),
): void {
  const text = notesText(comment) ?? "";
  const tags = `${material ? `[Original material: ${material}]\n` : ""}${link ? `[Spoolstock link: ${link}]\n` : ""}`;
  const notes = `${tags}${text}`.trimEnd();
  if (notes) target["notes"] = notes;
  else delete target["notes"];
}
