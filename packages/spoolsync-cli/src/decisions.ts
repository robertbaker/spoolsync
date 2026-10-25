import { pairKey } from "@spoolsync/core/core/match";

export function pairArg(value: string): string {
  const records = value.split(",");
  if (
    records.length !== 2 ||
    records.some(
      (record) =>
        !/^(spoolman|spoolstock|spoolio|tigertag|threeDfp|bambuddy|filameter|filadex|filamentdb):.+$/.test(
          record,
        ),
    )
  ) {
    throw new Error(`Invalid pair "${value}". Use source:id,source:id.`);
  }
  if (records[0]!.split(":")[0] === records[1]!.split(":")[0])
    throw new Error("Match pairs must refer to different inventory sources.");
  if (records.some((record) => record.includes("|")))
    throw new Error("Match record IDs cannot contain |.");
  return pairKey(records[0]!, records[1]!);
}
