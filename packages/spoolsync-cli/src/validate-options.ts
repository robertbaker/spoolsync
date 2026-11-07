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
    filamentDbUrl,
    filamentDbToken,
    bambuddyUrl,
    bambuddyToken,
    filadexUrl,
    filadexUser,
    apply,
    outputDir,
    exportCsv,
    summary,
    reorder,
    cleanup,
    cleanupReport,
    reference,
    referenceReport,
    failOnMismatch,
    restoreRollback,
    noRollback,
    rollbackDir,
    saveConfig,
    lowThreshold,
    watch,
    quiet,
  } = options;
  if (spoolmanUrl && inputs.has("spoolman"))
    throw new Error("Use either --spoolman-url or --spoolman <file>, not both.");
  if (spoolmanToken && !spoolmanUrl) throw new Error("--spoolman-token requires --spoolman-url.");
  if (filamentdbUrl && inputs.has("filamentdb"))
    throw new Error("Use either --filamentdb-url or --filamentdb <file>, not both.");
  if (filamentdbToken && !filamentdbUrl)
    throw new Error("--filamentdb-token requires --filamentdb-url.");
  if (filamentDbUrl && inputs.has("filamentDbApp"))
    throw new Error("Use either --filament-db-url or --filament-db <file>, not both.");
  if (filamentDbToken && !filamentDbUrl)
    throw new Error("--filament-db-token requires --filament-db-url.");
  if (bambuddyUrl && inputs.has("bambuddy"))
    throw new Error("Use either --bambuddy-url or --bambuddy <file>, not both.");
  if (bambuddyToken && !bambuddyUrl) throw new Error("--bambuddy-token requires --bambuddy-url.");
  if (filadexUrl && inputs.has("filadex"))
    throw new Error("Use either --filadex-url or --filadex <file>, not both.");
  if (!!filadexUrl !== !!filadexUser)
    throw new Error("--filadex-url and --filadex-user must be used together.");
  for (const [flag, url] of [
    ["--spoolman-url", spoolmanUrl],
    ["--filamentdb-url", filamentdbUrl],
    ["--filament-db-url", filamentDbUrl],
    ["--bambuddy-url", bambuddyUrl],
    ["--filadex-url", filadexUrl],
  ] as const) {
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${flag} must be a valid http:// or https:// URL.`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error(`${flag} must use http:// or https://.`);
    if (parsed.username || parsed.password)
      throw new Error(
        `${flag} cannot include credentials in the URL. Pass a token flag or environment variable instead.`,
      );
  }
  if (apply && !spoolmanUrl && !filamentdbUrl && !filamentDbUrl && !bambuddyUrl && !filadexUrl)
    throw new Error(
      "--apply requires --spoolman-url, --filamentdb-url, --filament-db-url, --bambuddy-url, or --filadex-url; file inputs are never written to a service.",
    );
  for (const source of empty)
    if (
      inputs.has(source) ||
      (source === "spoolman" && spoolmanUrl) ||
      (source === "filamentdb" && filamentdbUrl) ||
      (source === "filamentDbApp" && filamentDbUrl) ||
      (source === "bambuddy" && bambuddyUrl) ||
      (source === "filadex" && filadexUrl)
    )
      throw new Error(`Use either --empty ${source} or a file/API input for ${source}, not both.`);
  const inventories =
    inputs.size +
    empty.length +
    (spoolmanUrl ? 1 : 0) +
    (filamentdbUrl ? 1 : 0) +
    (filamentDbUrl ? 1 : 0) +
    (bambuddyUrl ? 1 : 0) +
    (filadexUrl ? 1 : 0);
  if (quiet && !watch)
    throw new Error(
      "--quiet only applies with --watch, where it hides runs that print the same thing.",
    );
  if (watch) {
    if (apply)
      throw new Error(
        "--watch cannot be combined with --apply: writing to a service on every file change is too easy to do by accident. Run --apply once, on its own.",
      );
    if (spoolmanUrl || filamentdbUrl || filamentDbUrl || bambuddyUrl || filadexUrl)
      throw new Error("--watch only watches files, so it cannot be used with --*-url inventories.");
    if (!inputs.size) throw new Error("--watch needs at least one file input to watch.");
  }
  const changeOptions = [
    apply && "--apply",
    outputDir && "--output-dir",
    createIn.length && "--create-in",
    resolves.length && "--resolve",
    confirm.length && "--confirm",
    reject.length && "--reject",
  ].filter(Boolean);
  const countsLow = summary || reorder;
  if ((cleanup || cleanupReport) && countsLow)
    throw new Error(
      `--${cleanup ? "cleanup" : "cleanup-report"} cannot be combined with --summary or --reorder, which only report what is loaded.`,
    );
  if ((reference || referenceReport) && countsLow)
    throw new Error(
      `--${reference ? "reference" : "reference-report"} cannot be combined with --summary or --reorder, which only report what is loaded.`,
    );
  if (failOnMismatch && !reference && !referenceReport)
    throw new Error(
      "--fail-on-mismatch needs a reference file to check against. Add --reference <file> or --reference-report <file>.",
    );
  if (restoreRollback) {
    const others = [
      inputs.size && "an inventory file",
      empty.length && "--empty",
      summary && "--summary",
      reorder && "--reorder",
      cleanup && "--cleanup",
      cleanupReport && "--cleanup-report",
      reference && "--reference",
      referenceReport && "--reference-report",
      outputDir && "--output-dir",
      exportCsv && "--export-csv",
      watch && "--watch",
      saveConfig && "--save-config",
      ...changeOptions.filter((option) => option !== "--apply"),
    ].filter(Boolean);
    if (others.length)
      throw new Error(
        `--restore-rollback puts back one service's values, so it cannot be combined with ${others.join(", ")}.`,
      );
    if (!spoolmanUrl && !filamentdbUrl && !filamentDbUrl && !bambuddyUrl && !filadexUrl)
      throw new Error(
        "--restore-rollback needs the connection of the service it restores: --spoolman-url, --filamentdb-url, --filament-db-url, --bambuddy-url, or --filadex-url.",
      );
    return;
  }
  if ((noRollback || rollbackDir) && !apply && !saveConfig)
    throw new Error(
      `${noRollback ? "--no-rollback" : "--rollback-dir"} applies to --apply, the only time SpoolSync writes to a service.`,
    );
  // `--cleanup-report` alone only lists proposals; with `--cleanup` it adds them to the comparison.
  const cleanupOnly = cleanupReport && !cleanup;
  // The same for `--reference-report` and `--reference`.
  const referenceOnly = Boolean(referenceReport) && !reference;
  const reportOnly = countsLow || cleanupOnly || referenceOnly;
  if (saveConfig && (apply || watch || summary || reorder || exportCsv))
    throw new Error(
      "--save-config only saves defaults, so it cannot be combined with --apply, --watch, --summary, --reorder, or --export-csv.",
    );
  if (lowThreshold !== undefined && !countsLow && !saveConfig)
    throw new Error(
      "--low-threshold applies to --summary and --reorder, the reports that count low spools.",
    );
  if (reportOnly && changeOptions.length)
    throw new Error(
      `--${summary ? "summary" : reorder ? "reorder" : cleanupOnly ? "cleanup-report" : "reference-report"} only reports what is loaded, so it cannot be combined with ${changeOptions.join(", ")}.`,
    );
  if (cleanup && inventories < 2 && !saveConfig)
    throw new Error(
      "--cleanup adds changes to the plan between inventories, so it needs at least two. Use --cleanup-report to list the proposals for a single inventory.",
    );
  if (reference && inventories < 2 && !saveConfig)
    throw new Error(
      "--reference adds changes to the plan between inventories, so it needs at least two. Use --reference-report to list the matches for a single inventory.",
    );
  // Saving defaults does not run a comparison, so it needs no inventories at all.
  if (inventories < 2 && !saveConfig) {
    if (!(exportCsv || reportOnly))
      throw new Error(
        "Provide at least two inventories to compare, for example --spoolman <file> --spoolio <file>. With a single inventory, use --summary to see what it holds, --reorder for what is running low, or --export-csv <file> to export it.",
      );
    if (inventories < 1) throw new Error("Provide at least one inventory to report on or export.");
    if (changeOptions.length)
      throw new Error(
        `With a single inventory, comparing, resolving, and writing need at least two inventories; remove ${changeOptions.join(", ")}.`,
      );
  }
  // Saving defaults runs nothing, so the checks that tie options to loaded inventories do not apply.
  if (saveConfig) return;
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
    (source === "filamentDbApp" && !!filamentDbUrl) ||
    (source === "bambuddy" && !!bambuddyUrl) ||
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
