import type { PlannedChange, PlannedUpdate } from "../../core/compare";
import { FIELD_LABELS } from "../../core/comparison/fields";
import type { ApplyLogEntry } from "../../core/model";

/** How one service writes a single planned change and words the outcome. */
export interface ChangeWriter {
  /** Writes the change and returns its log line. Notes are appended to that line in brackets. */
  write(change: PlannedChange, note: (text: string) => void): Promise<string>;
  /** What a failure message calls this change, such as `spool 12`. */
  subject(change: PlannedChange): string;
  /** Added to a failure message when part of the change had already been written. */
  partialWrite?(): string;
}

/** The planned fields of an update, in lower case, for its log line. */
export const changedFieldNames = (change: PlannedUpdate): string[] =>
  change.changes.map((fieldChange) => FIELD_LABELS[fieldChange.field].toLowerCase());

/**
 * Writes each change on its own, in order, and logs it, so one failure does not stop the rest and a
 * partial run is always reported in full.
 */
export async function applyEachChange(
  changes: readonly PlannedChange[],
  writer: ChangeWriter,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  const log: ApplyLogEntry[] = [];
  let done = 0;
  for (const change of changes) {
    const notes: string[] = [];
    try {
      const message = await writer.write(change, (text) => notes.push(text));
      log.push({
        groupId: change.groupId,
        ok: true,
        message: notes.length ? `${message} (${notes.join(" ")})` : message,
      });
    } catch (error) {
      log.push({
        groupId: change.groupId,
        ok: false,
        message: `Failed on ${writer.subject(change)}: ${(error as Error).message}${writer.partialWrite?.() ?? ""}`,
      });
    }
    onProgress?.(++done, changes.length);
  }
  return log;
}
