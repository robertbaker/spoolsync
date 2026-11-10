import type { CliChoices } from "@spoolsync/core/cli-choices";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import {
  SOURCE_IDS,
  SOURCE_LABELS,
  isWritableSource,
  type SourceId,
} from "@spoolsync/core/core/model";

/** The input flag each service has in the CLI. */
const INPUT_FLAGS: Record<SourceId, string> = {
  spoolman: "--spoolman",
  spoolstock: "--spoolstock",
  spoolio: "--spoolio",
  tigertag: "--tigertag",
  threeDfp: "--three-dfp",
  bambuddy: "--bambuddy",
  filameter: "--filameter",
  filadex: "--filadex",
  filamentdb: "--filamentdb",
  filamentDbApp: "--filament-db",
  spoolmaster: "--spoolmaster",
  spoolhoarder: "--spoolhoarder",
  spoolapp: "--spool",
  spoolkeep: "--spoolkeep",
};

/** Services the CLI can read directly, with the options and environment variable it uses. */
const API_INPUTS: Partial<
  Record<SourceId, { flag: string; token: string; fallbackToken?: string }>
> = {
  spoolman: { flag: "--spoolman-url", token: "SPOOLMAN_TOKEN" },
  filamentdb: { flag: "--filamentdb-url", token: "FILAMENTDB_TOKEN" },
  filamentDbApp: {
    flag: "--filament-db-url",
    token: "FILAMENT_DB_API_KEY",
    fallbackToken: "FILAMENTDB_API_KEY",
  },
  bambuddy: { flag: "--bambuddy-url", token: "BAMBUDDY_API_KEY" },
};

/** Services the CLI can write directly with `--apply`. */
const API_WRITES: ReadonlySet<SourceId> = new Set([
  "spoolman",
  "filamentdb",
  "filamentDbApp",
  "bambuddy",
]);

export interface CliCommandInput {
  loaded: ReadonlyMap<SourceId, { origin?: "api" | "file" }>;
  choices: CliChoices;
  /** The plan to reproduce, with excluded changes already removed. */
  plan: ReadonlyMap<SourceId, PlannedChange[]>;
  excludedCount: number;
}

export interface CliCommand {
  /** The command, with notes as leading `#` comments. */
  text: string;
  /** Plain sentences on where the command differs from the plan. Empty when it is equivalent. */
  caveats: string[];
}

/** Quotes a shell word unless it is made only of characters the shell never treats specially. */
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The `spoolsync` invocation closest to the current plan. It uses only options the CLI has, and
 * never contains secrets: addresses, file names and the output folder are placeholders, and tokens
 * come from the environment variables the CLI reads.
 */
export function buildCliCommand(input: CliCommandInput): CliCommand {
  const { loaded, choices, plan, excludedCount } = input;
  const args: string[] = [];
  const notes: string[] = [];
  const caveats: string[] = [];

  for (const source of SOURCE_IDS) {
    const result = loaded.get(source);
    if (!result) continue;
    const api = API_INPUTS[source];
    if (result.origin === "api" && api) {
      args.push(`${api.flag} ${shellQuote(`<${source}-url>`)}`);
      const variable = api.fallbackToken ? `${api.token} (or ${api.fallbackToken})` : api.token;
      notes.push(`Set ${variable} in your environment if ${SOURCE_LABELS[source]} needs a token.`);
    } else {
      args.push(`${INPUT_FLAGS[source]} ${shellQuote(`<${source}-export-file>`)}`);
      if (result.origin === "api")
        notes.push(
          `${SOURCE_LABELS[source]} was read from its service, which the CLI cannot do: save an export and use it as the file.`,
        );
    }
  }
  for (const [field, source] of choices.resolves) args.push(`--resolve ${field}=${source}`);
  if (choices.createIn.length) args.push(`--create-in ${choices.createIn.join(",")}`);
  for (const pair of choices.confirm) args.push(`--confirm ${shellQuote(pair)}`);
  for (const pair of choices.reject) args.push(`--reject ${shellQuote(pair)}`);

  const writing = [...plan].filter(
    ([source, changes]) => changes.length > 0 && isWritableSource(source),
  );
  const toFile = writing.some(([source]) => {
    const origin = loaded.get(source)?.origin;
    return origin !== "api" || !API_WRITES.has(source);
  });
  const toApi = writing.some(
    ([source]) => loaded.get(source)?.origin === "api" && API_WRITES.has(source),
  );
  if (toFile) args.push(`--output-dir ${shellQuote("<output-dir>")}`);
  if (toApi) args.push("--apply");

  if (excludedCount > 0)
    caveats.push(
      `The CLI cannot leave out individual changes, so it would also write the ${plural(excludedCount, "change")} you excluded.`,
    );
  else if (choices.extra > 0)
    caveats.push(
      `The CLI takes one source per field for every spool, so it would write ${plural(choices.extra, "change")} that this plan does not contain.`,
    );
  if (choices.missing > 0)
    caveats.push(
      `The CLI would not write ${plural(choices.missing, "change")} that this plan contains.`,
    );

  const lines = [
    ...caveats.map((line) => `# NOTE: ${line}`),
    ...notes.map((line) => `# ${line}`),
    "spoolsync" + (args.length ? " \\" : ""),
    ...args.map((arg, index) => `  ${arg}${index < args.length - 1 ? " \\" : ""}`),
  ];
  return { text: lines.join("\n"), caveats };
}
