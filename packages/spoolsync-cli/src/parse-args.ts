import {
  COMPARABLE_FIELDS,
  SOURCE_IDS,
  WRITABLE_SOURCE_IDS,
  type ComparableField,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";

import { help } from "./help";
import type { Options } from "./options";
import { validateOptions } from "./validate-options";

const sourceFlags: Record<string, SourceId> = {
  "--spoolman": "spoolman",
  "--spoolstock": "spoolstock",
  "--spoolio": "spoolio",
  "--tigertag": "tigertag",
  "--three-dfp": "threeDfp",
  "--3dfp": "threeDfp",
  "--bambuddy": "bambuddy",
  "--filameter": "filameter",
  "--filadex": "filadex",
  "--filamentdb": "filamentdb",
};

const SINGLETON_FLAGS: string[] = [
  "--output-dir",
  "--spoolman-url",
  "--spoolman-token",
  "--filamentdb-url",
  "--filamentdb-token",
  "--filadex-url",
  "--filadex-user",
];

export function parseArgs(args: string[]): Options {
  const inputs = new Map<SourceId, string>();
  const empty: WritableSourceId[] = [];
  const resolves: Array<[ComparableField, SourceId]> = [];
  const createIn: WritableSourceId[] = [];
  const confirm: string[] = [];
  const reject: string[] = [];
  let outputDir: string | undefined;
  let spoolmanUrl: string | undefined;
  let spoolmanToken: string | undefined;
  let filamentdbUrl: string | undefined;
  let filamentdbToken: string | undefined;
  let filadexUrl: string | undefined;
  let filadexUser: string | undefined;
  let apply = false;
  let json = false;
  const singletonFlags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const separator = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const arg = separator > 0 ? raw.slice(0, separator) : raw;
    const inline = separator > 0 ? raw.slice(separator + 1) : undefined;
    if (
      inline !== undefined &&
      !Object.hasOwn(sourceFlags, arg) &&
      ![
        "--resolve",
        "--confirm",
        "--reject",
        "--create-in",
        "--empty",
        ...SINGLETON_FLAGS,
      ].includes(arg)
    )
      throw new Error("Unknown option: " + raw);
    const value = (flag: string) => {
      const next = inline ?? args[i + 1];
      if (!next || (inline === undefined && next.startsWith("-")))
        throw new Error(flag + " requires a value");
      if (inline === undefined) i++;
      return next;
    };
    if (SINGLETON_FLAGS.includes(arg)) {
      if (singletonFlags.has(arg)) throw new Error(`${arg} may only be provided once`);
      singletonFlags.add(arg);
    }
    if (arg === "--help" || arg === "-h") {
      help();
      process.exit(0);
    }
    if (Object.hasOwn(sourceFlags, arg)) {
      const source = sourceFlags[arg]!;
      if (inputs.has(source)) throw new Error(`${arg} may only be provided once`);
      inputs.set(source, value(arg));
    } else if (arg === "--resolve") {
      const [field, source, ...extra] = value(arg).split("=");
      if (
        extra.length ||
        !COMPARABLE_FIELDS.includes(field as ComparableField) ||
        !SOURCE_IDS.includes(source as SourceId)
      ) {
        throw new Error(`Invalid resolution. Expected field=source, such as material=spoolman.`);
      }
      const previous = resolves.find(([candidate]) => candidate === field);
      if (previous && previous[1] !== source)
        throw new Error(
          `Conflicting resolutions for ${field}: ${previous[1]} and ${source}. Choose one source per field.`,
        );
      if (!previous) resolves.push([field as ComparableField, source as SourceId]);
    } else if (arg === "--confirm" || arg === "--reject") {
      (arg === "--confirm" ? confirm : reject).push(value(arg));
    } else if (arg === "--create-in" || arg === "--empty") {
      const targets = arg === "--empty" ? empty : createIn;
      for (const source of value(arg).split(",")) {
        if (!SOURCE_IDS.includes(source as SourceId))
          throw new Error(`Unknown source in ${arg}: ${source}`);
        if (!WRITABLE_SOURCE_IDS.includes(source as WritableSourceId))
          throw new Error(`${source} is read-only and cannot be a ${arg} target.`);
        if (!targets.includes(source as WritableSourceId)) targets.push(source as WritableSourceId);
      }
    } else if (arg === "--output-dir") {
      outputDir = value(arg);
    } else if (arg === "--spoolman-url") {
      spoolmanUrl = value(arg);
    } else if (arg === "--spoolman-token") {
      spoolmanToken = value(arg);
    } else if (arg === "--filamentdb-url") {
      filamentdbUrl = value(arg);
    } else if (arg === "--filamentdb-token") {
      filamentdbToken = value(arg);
    } else if (arg === "--filadex-url") {
      filadexUrl = value(arg);
    } else if (arg === "--filadex-user") {
      filadexUser = value(arg);
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  const options: Options = {
    inputs,
    empty,
    resolves,
    createIn,
    confirm,
    reject,
    ...(spoolmanUrl ? { spoolmanUrl } : {}),
    ...(spoolmanToken ? { spoolmanToken } : {}),
    ...(filamentdbUrl ? { filamentdbUrl } : {}),
    ...(filamentdbToken ? { filamentdbToken } : {}),
    ...(filadexUrl ? { filadexUrl } : {}),
    ...(filadexUser ? { filadexUser } : {}),
    apply,
    ...(outputDir ? { outputDir } : {}),
    json,
  };
  validateOptions(options);
  return options;
}
