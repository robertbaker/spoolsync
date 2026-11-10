import { pairKey } from "@spoolsync/core/core/match";
import { SERVICE_IDS } from "@spoolsync/core/core/services";

const SOURCE_RECORD = new RegExp(`^(${SERVICE_IDS.join("|")}):.+$`);
/** Where the second record starts: a comma followed by a source name and colon. */
const SECOND_RECORD = new RegExp(`,(?=(?:${SERVICE_IDS.join("|")}):)`, "g");

/**
 * Parses `source:id,source:id` into the saved pair key. Record IDs may contain `,` and `|` (the key
 * escapes `|`); the pair splits at the one comma that is followed by another `source:`.
 */
export function pairArg(value: string): string {
  const starts = [...value.matchAll(SECOND_RECORD)].map((match) => match.index);
  const records =
    starts.length === 1 ? [value.slice(0, starts[0]), value.slice(starts[0]! + 1)] : [];
  if (records.length !== 2 || records.some((record) => !SOURCE_RECORD.test(record))) {
    throw new Error(`Invalid pair "${value}". Use source:id,source:id.`);
  }
  if (records[0]!.split(":")[0] === records[1]!.split(":")[0])
    throw new Error("Match pairs must refer to different inventory sources.");
  return pairKey(records[0]!, records[1]!);
}
