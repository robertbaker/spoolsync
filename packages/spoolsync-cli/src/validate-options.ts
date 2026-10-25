import {
  WRITABLE_SOURCE_IDS,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";

import { pairArg } from "./decisions";
import type { Options } from "./options";

export function validateOptions(options: Options): void {
  const {
    inputs,
    empty,
    resolves,
    createIn,
    confirm,
    reject,
    spoolmanUrl,
    spoolmanToken,
    filamentdbUrl,
    filamentdbToken,
    filadexUrl,
    filadexUser,
    apply,
    outputDir,
  } = options;
  if (spoolmanUrl && inputs.has("spoolman"))
    throw new Error("Use either --spoolman-url or --spoolman <file>, not both.");
  if (spoolmanToken && !spoolmanUrl) throw new Error("--spoolman-token requires --spoolman-url.");
  if (filamentdbUrl && inputs.has("filamentdb"))
    throw new Error("Use either --filamentdb-url or --filamentdb <file>, not both.");
  if (filamentdbToken && !filamentdbUrl)
    throw new Error("--filamentdb-token requires --filamentdb-url.");
  if (filadexUrl && inputs.has("filadex"))
    throw new Error("Use either --filadex-url or --filadex <file>, not both.");
  if (!!filadexUrl !== !!filadexUser)
    throw new Error("--filadex-url and --filadex-user must be used together.");
  if (apply && !spoolmanUrl && !filamentdbUrl && !filadexUrl)
    throw new Error(
      "--apply requires --spoolman-url, --filamentdb-url, or --filadex-url; file inputs are never written to a service.",
    );
  for (const source of empty)
    if (
      inputs.has(source) ||
      (source === "spoolman" && spoolmanUrl) ||
      (source === "filamentdb" && filamentdbUrl) ||
      (source === "filadex" && filadexUrl)
    )
      throw new Error(`Use either --empty ${source} or a file/API input for ${source}, not both.`);
  if (
    inputs.size +
      empty.length +
      (spoolmanUrl ? 1 : 0) +
      (filamentdbUrl ? 1 : 0) +
      (filadexUrl ? 1 : 0) <
    2
  )
    throw new Error("Provide at least two inventories to compare.");
  if (
    outputDir &&
    ![...inputs.keys(), ...empty].some((source) =>
      WRITABLE_SOURCE_IDS.includes(source as WritableSourceId),
    )
  )
    throw new Error(
      "--output-dir requires a writable file input or --empty target. Use --apply to write to a directly loaded inventory.",
    );
  const isLoaded = (source: SourceId) =>
    inputs.has(source) ||
    empty.includes(source as WritableSourceId) ||
    (source === "spoolman" && !!spoolmanUrl) ||
    (source === "filamentdb" && !!filamentdbUrl) ||
    (source === "filadex" && !!filadexUrl);
  for (const source of createIn)
    if (!isLoaded(source)) throw new Error(`--create-in ${source} requires --${source} input`);
  for (const [field, source] of resolves)
    if (!isLoaded(source))
      throw new Error(`--resolve ${field}=${source} requires --${source} input`);
  const confirmed = confirm.map(pairArg);
  const rejected = new Set(reject.map(pairArg));
  for (const pair of confirmed)
    if (rejected.has(pair)) throw new Error("A pair cannot be both confirmed and rejected.");
  for (const pair of [...confirmed, ...rejected])
    for (const record of pair.split("|")) {
      const source = record.split(":")[0] as SourceId;
      if (!isLoaded(source))
        throw new Error("Match decision requires a loaded " + source + " inventory.");
    }
}
