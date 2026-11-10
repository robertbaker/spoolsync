import { toText } from "../../core/normalize";
import { field } from "../shared/tabular";
import { taggedMaterialAndFinish, type MaterialTags } from "./vocabulary";

/** The notes lines that hold what `material` and `material_type` cannot, by tag name. */
const LABELS = { material: "Material", finish: "Finish" } as const;
type TagKey = keyof MaterialTags;
const KEYS = Object.keys(LABELS) as TagKey[];
const linePattern = (key: TagKey) => new RegExp(`^${LABELS[key]}:[ \\t]*(\\S.*?)[ \\t]*$`, "im");
const lineTest = (key: TagKey) => new RegExp(`^${LABELS[key]}:[ \\t]*\\S`, "i");

export const NOTE_KEYS = ["notes", "comment", "description"] as const;

export function readNoteTags(notes: string | null): MaterialTags {
  const tags: MaterialTags = {};
  for (const key of KEYS) {
    const value = notes ? linePattern(key).exec(notes)?.[1] : undefined;
    if (value) tags[key] = value;
  }
  return tags;
}

/** The notes without the tag lines of the given keys. */
export function stripNoteTags(notes: string, keys: readonly TagKey[]): string {
  if (!keys.length) return notes;
  const lines = notes.split(/\r?\n/);
  const skipped = new Set<number>();
  for (const key of keys) {
    const index = lines.findIndex((line) => lineTest(key).test(line));
    if (index !== -1) skipped.add(index);
  }
  return lines.filter((_, index) => !skipped.has(index)).join("\n");
}

/** The tag lines of the given keys as they stand in the notes, in their order, for re-adding. */
export function tagLines(notes: string | null, keys: readonly TagKey[]): string[] {
  const lines = (notes ?? "").split(/\r?\n/);
  return keys.flatMap((key) => lines.filter((line) => lineTest(key).test(line)).slice(0, 1));
}

/**
 * The notes with the given keys set to the tags: an existing line is changed where it stands, a new
 * one goes at the end, and a key without a tag loses its line.
 */
export function setNoteTags(
  notes: string | null,
  tags: MaterialTags,
  keys: readonly TagKey[],
): string {
  const lines = (notes ?? "").split(/\r?\n/);
  for (const key of keys) {
    const index = lines.findIndex((line) => lineTest(key).test(line));
    const value = tags[key];
    const line = value ? `${LABELS[key]}: ${value}` : undefined;
    if (index !== -1) {
      if (line) lines[index] = line;
      else lines.splice(index, 1);
    } else if (line) {
      while (lines.length && !lines.at(-1)?.trim()) lines.pop();
      lines.push(line);
    }
  }
  return lines.join("\n");
}

/** A row's common material and finish, with the tags in its notes that were applied to them. */
export function rowColumns(record: Record<string, unknown>) {
  const notes = toText(field(record, ...NOTE_KEYS));
  const column = toText(field(record, "material", "type", "filament_type"));
  const type = toText(field(record, "material_type"));
  return {
    notes,
    type,
    ...taggedMaterialAndFinish(column, type, readNoteTags(notes)),
  };
}
