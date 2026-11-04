import { formatPhrase } from "@spoolsync/core/core/services";

import { READ_ONLY_VIEWS, SERVICE_VIEWS, allServiceNames, joinNames } from "~/lib/services";

export const NPM_URL = "https://www.npmjs.com/package/spoolsync";
export const REPO_URL = "https://github.com/robertbaker/spoolsync/tree/main/packages/spoolsync-cli";

/** One file option per service, generated from the services registry. */
const fileInputs = SERVICE_VIEWS.map((service) => {
  const aliases = service.cliAliases.length > 0 ? ` (alias: ${service.cliAliases.join(", ")})` : "";
  const access = service.canWrite ? "" : " (read-only source)";
  const kind = `${formatPhrase(service.formats)} export`;
  return {
    flag: `${service.cliFlag} <file>`,
    copy: service.cliFlag,
    desc: `${service.name} ${kind}${access}${aliases}.`,
  };
});

export const inputs = [
  ...fileInputs,
  {
    flag: "--filamentdb-url <url>",
    copy: "--filamentdb-url",
    desc: "Load FilamentDB directly; --apply writes back (token via --filamentdb-token or FILAMENTDB_TOKEN).",
  },
  {
    flag: "--filadex-url <url> --filadex-user <name>",
    copy: "--filadex-url",
    desc: "Load Filadex directly; password from FILADEX_PASSWORD.",
  },
  {
    flag: "--empty <sources>",
    copy: "--empty",
    desc: "Start a new, empty inventory for writable sources (comma-separated; repeatable). Pair with --create-in to copy spools into it. Can't also be loaded from a file or API in the same run.",
  },
  {
    flag: "--spoolman-url <url>",
    copy: "--spoolman-url",
    desc: "Load Spoolman directly over the network instead of from a file.",
  },
  {
    flag: "--spoolman-token <token>",
    copy: "--spoolman-token",
    desc: "API token for a protected Spoolman server. Can also be set via SPOOLMAN_TOKEN.",
  },
];

export const planning = [
  {
    flag: "--resolve <field=source>",
    copy: "--resolve",
    desc: "When a field conflicts, use the value from the named source (e.g. material=spoolman). Repeatable.",
  },
  {
    flag: "--confirm <pair>",
    copy: "--confirm",
    desc: "Confirm a suggested match (source:id,source:id). Repeatable.",
  },
  {
    flag: "--reject <pair>",
    copy: "--reject",
    desc: "Reject a suggested match (source:id,source:id). Repeatable.",
  },
  {
    flag: "--create-in <sources>",
    copy: "--create-in",
    desc: "Create missing spools in loaded writable sources (comma-separated; read-only sources are never targets).",
  },
];

export const output = [
  {
    flag: "--output-dir <dir>",
    copy: "--output-dir",
    desc: "Write updated import files for file-loaded writable sources into this directory. Must differ from your input files.",
  },
  {
    flag: "--config <file>",
    copy: "--config",
    desc: "Read default options from a JSON file (paths are relative to the file). Command-line options replace the same option from the file. Tokens and passwords are refused; keep them in environment variables.",
  },
  {
    flag: "--completion <shell>",
    copy: "--completion",
    desc: "Print a completion script for bash, zsh, or fish. For example: source <(spoolsync --completion bash).",
  },
  {
    flag: "--watch",
    copy: "--watch",
    desc: "Run again whenever an input file changes (handles editors that save by replacing the file). Needs file inputs; refused with --apply and --*-url, so a service is never written on every save. Press Ctrl+C to stop.",
  },
  {
    flag: "--quiet",
    copy: "--quiet",
    desc: "With --watch, print a run only when its output differs from the previous run. Errors that differ are still shown. Each --watch run after the first also lists what changed since the previous run: spools added or removed, remaining-weight changes, and new possible matches (a changesSinceLastRun object with --format json).",
  },
  {
    flag: "--save-config",
    copy: "--save-config",
    desc: "Save the options you give, and your inventory file paths, as defaults in your per-user settings file (~/.config/spoolsync/config.json). Tokens, --apply and per-run choices are never saved.",
  },
  {
    flag: "--show-config",
    copy: "--show-config",
    desc: "Show what the settings file, --config, and the command line each contribute, to see where an option's value comes from.",
  },
  {
    flag: "--export-settings <file>",
    copy: "--export-settings",
    desc: "Write your saved settings to a file. The format matches the browser's settings export, so the low-stock threshold can be shared.",
  },
  {
    flag: "--import-settings <file>",
    copy: "--import-settings",
    desc: "Replace your saved settings with ones exported from the CLI or the browser. Secrets and unknown keys are refused; unused browser entries are reported as skipped.",
  },
  {
    flag: "--no-user-config",
    copy: "--no-user-config",
    desc: "Ignore the per-user settings file for this run.",
  },
  {
    flag: "--config-path",
    copy: "--config-path",
    desc: "Print where the per-user settings file lives (also $SPOOLSYNC_CONFIG_DIR, %APPDATA% on Windows).",
  },
  {
    flag: "--clear-config",
    copy: "--clear-config",
    desc: "Delete the per-user settings file.",
  },
  {
    flag: "--low-threshold <pct>",
    copy: "--low-threshold",
    desc: "With --summary or --reorder, the whole percent of full weight at or under which a spool counts as low (1 to 90, default 20). Also a numeric key in --config files.",
  },
  {
    flag: "--reorder",
    copy: "--reorder",
    desc: "Print a shopping list of spools that are running low (at or under a fifth of their full weight), each spool once. Works with a single inventory.",
  },
  {
    flag: "--summary",
    copy: "--summary",
    desc: "Print counts for each loaded inventory (spools, archived, brands, materials, remaining grams, and how many are running low) instead of planning changes. Works with a single inventory.",
  },
  {
    flag: "--cleanup[=<rules>]",
    copy: "--cleanup",
    desc: "Apply safe data cleanups (extra spaces, capitalization, color codes, number formats) as planned changes on the record they came from, before comparing. Anything that needs a look (aliases, unit conversions, moved finishes) is listed, not applied. Name rules with --cleanup=casing,whitespace, or leave one out with --cleanup=all,-casing. Also a config key (true, or text naming rules).",
  },
  {
    flag: "--cleanup-report[=<rules>]",
    copy: "--cleanup-report",
    desc: "List every proposed cleanup and every value that looks wrong (negative weights, odd diameters, damaged barcodes) with the rule and a reason. On its own it changes and plans nothing and works with a single inventory; with --cleanup it adds the full list to the comparison.",
  },
  {
    flag: "--reference <file>",
    copy: "--reference",
    desc: "Match spools to a reference file (JSON or CSV of filaments with a brand, color and optional temperatures, weights and barcode, or the Open Filament Database or FilamentColors snapshot downloaded from this site's /reference/ folder) and add the values your services are missing, from confident single matches only, to the plan. Overwrites, partial matches and ambiguous matches are listed, never applied. Needs two inventories. The CLI reads only the file you give it. Also a config key (a path).",
  },
  {
    flag: "--reference-report <file>",
    copy: "--reference-report",
    desc: "List every reference match, difference, ambiguous choice and color check (CIEDE2000) for the file. On its own it changes and plans nothing and works with a single inventory; with --reference it adds the full list to the comparison.",
  },
  {
    flag: "--fail-on-mismatch",
    copy: "--fail-on-mismatch",
    desc: "With --reference or --reference-report, exit with code 1 when a spool's value or color differs from the reference, so a scheduled run can flag drift. Fills for empty fields do not count.",
  },
  {
    flag: "--rollback-dir <dir>",
    copy: "--rollback-dir",
    desc: "Where --apply saves the rollback file it makes before writing to a service. Defaults to a rollbacks folder beside the settings file. Also a config key (a path).",
  },
  {
    flag: "--no-rollback",
    copy: "--no-rollback",
    desc: "With --apply, write to a service without saving a rollback file first. By default nothing is written if the file cannot be saved.",
  },
  {
    flag: "--restore-rollback <file>",
    copy: "--restore-rollback",
    desc: "Put back the values a rollback file recorded in the service named by --spoolman-url, --filamentdb-url or --filadex-url. Fields changed since are left alone, and nothing is written without --apply.",
  },
  {
    flag: "--export-csv <file>",
    copy: "--export-csv",
    desc: "Write every loaded spool to one CSV file, tagged by service. Works with a single inventory, and never overwrites an input file.",
  },
  {
    flag: "--apply",
    copy: "--apply",
    desc: "Apply planned changes directly to Spoolman. Requires --spoolman-url.",
  },
  {
    flag: "--format <text|json>",
    copy: "--format json",
    desc: 'Choose text (the default) or json. JSON prints one versioned report (schemaVersion, report: "compare" or "inventory") on stdout only, in a fixed order, with a pendingMatches list for comparisons. Also works with --summary and --reorder, in a --config or settings file, and in --watch.',
  },
  {
    flag: "--json",
    copy: "--json",
    desc: 'Same as --format json: the plan as JSON, including warnings, written files, and apply results. Errors are returned as {"error": {"message"}}.',
  },
  {
    flag: "-V, --version",
    copy: "--version",
    desc: 'Show the installed CLI version. Add --json to get {"version": "…"} for scripts.',
  },
  { flag: "-h, --help", copy: "--help", desc: "Show usage, resolvable fields, and source names." },
];

export const optionGroups = [
  { title: "Inputs", note: "Provide at least two.", rows: inputs },
  { title: "Planning", note: "Optional: resolve conflicts and matches.", rows: planning },
  { title: "Output", note: "Dry run unless specified.", rows: output },
];

export const examples = [
  {
    title: "Preview a plan",
    icon: "material-symbols:visibility-outline",
    effect: { label: "Writes nothing", color: "success" },
    body: "Compare three exports and see what would change.",
    file: "preview",
    code: "spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json",
  },
  {
    title: "Write updated files",
    icon: "material-symbols:save-outline",
    effect: { label: "Writes ./updated", color: "info" },
    body: "Use Spoolstock values to resolve conflicts, add missing spools to Spoolio, and save updated import files.",
    file: "update-files",
    code: "spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json --resolve material=spoolstock --create-in spoolio --output-dir ./updated",
  },
  {
    title: "Remember your setup",
    icon: "material-symbols:bookmark-outline",
    effect: { label: "Writes ~/.config/spoolsync", color: "info" },
    body: "Save your inventory paths and usual options once; later runs need no arguments. Saved inventories are used only when you name none.",
    file: "save-config",
    code: "spoolsync --spoolio ~/inv/spoolio.json --spoolkeep ~/inv/SpoolKeep.json --output-dir ~/inv/updated --save-config\nspoolsync --summary",
  },
  {
    title: "See what an export holds",
    icon: "material-symbols:summarize-outline",
    effect: { label: "Writes nothing", color: "success" },
    body: "Print counts for each file you give it, without planning anything. Handy for checking a new export.",
    file: "summary",
    code: "spoolsync --spoolkeep SpoolKeep.json --summary",
  },
  {
    title: "Export everything to a spreadsheet",
    icon: "material-symbols:table-chart-outline",
    effect: { label: "Writes ./inventory.csv", color: "info" },
    body: "Combine any loaded inventories, even just one, into a single CSV for a spreadsheet or backup.",
    file: "export-csv",
    code: "spoolsync --spoolmaster SpoolMaster.xlsx --spoolkeep SpoolKeep.json --export-csv ./inventory.csv",
  },
  {
    title: "Update Spoolman directly",
    icon: "material-symbols:cloud-sync-outline",
    effect: { label: "Writes to Spoolman", color: "warning" },
    body: "Load Spoolman over the network and write the changes back. Needs --apply.",
    file: "apply",
    code: "# only if your server needs a token\nexport SPOOLMAN_TOKEN=your-token\nspoolsync --spoolman-url http://spoolman.local --spoolstock spoolstock.csv --apply",
  },
  {
    title: "Start a new inventory",
    icon: "material-symbols:note-add-outline",
    effect: { label: "Writes ./updated", color: "info" },
    body: "Seed a brand-new FilaMeter inventory from a Spoolio export, with no starter file needed.",
    file: "empty",
    code: "spoolsync --spoolio spoolio.json --empty filameter --create-in filameter --output-dir ./updated",
  },
  {
    title: "Review match suggestions",
    icon: "material-symbols:compare-arrows",
    effect: { label: "Writes nothing", color: "success" },
    body: "Copy a suggested pair from the plan output, then confirm or reject it on the next run.",
    file: "matches",
    code: "spoolsync --spoolman spoolman.json --spoolio spoolio.json \\\n  --confirm spoolman:12,spoolio:abc --reject spoolman:14,spoolio:xyz",
  },
  {
    title: "Use in scripts",
    icon: "material-symbols:data-object",
    effect: { label: "Writes nothing", color: "success" },
    body: "Print the plan as JSON and pipe it into your own tooling.",
    file: "json",
    code: "spoolsync --spoolman spoolman.json --spoolio spoolio.json --json | jq '.changes'",
  },
] as const;

export const installTabs = [
  { id: "npm", label: "npm", code: "npm install --global spoolsync" },
  { id: "pnpm", label: "pnpm", code: "pnpm add --global spoolsync" },
  { id: "bun", label: "bun", code: "bun add --global spoolsync" },
  { id: "npx", label: "npx", code: "npx spoolsync --help" },
];

export const sampleOutput = `6 spools in 2 inventories; 5 groups, 1 match suggestion.
  spoolman: 2 updates, 0 creates
  spoolio: 1 update, 1 create
1 field conflict remains unresolved; those values will be left as-is.
Dry run only. Add --output-dir <dir> to write inventory files, or --apply with --spoolman-url to write to Spoolman.`;

export const sections = [
  { href: "#quick-start", label: "Quick start" },
  { href: "#examples", label: "Examples" },
  { href: "#options", label: "Options" },
  { href: "#notes", label: "Notes" },
];

export const safety = [
  {
    icon: "material-symbols:visibility-outline",
    title: "Dry run by default",
    body: "Without --output-dir or --apply, SpoolSync only prints the plan.",
  },
  {
    icon: "material-symbols:shield-outline",
    title: "Source files stay untouched",
    body: "--apply requires --spoolman-url. Export files are only written to your --output-dir.",
  },
  {
    icon: "material-symbols:rule",
    title: "Unresolved fields stay put",
    body: "Any conflict you haven't resolved is left as-is and counted in the summary.",
  },
  {
    icon: "material-symbols:lock-outline",
    title: "Staged, then written",
    body: "Every export is prepared before anything is written, and output paths that would overwrite an input are rejected.",
  },
];

export const quickSteps = [
  {
    title: "Export",
    body: `Export your inventory from at least two supported tools (${allServiceNames(undefined, "or")}).`,
  },
  {
    title: "Preview",
    body: "Run spoolsync with a flag for each file to inspect planned updates and creations.",
  },
  {
    title: "Resolve",
    body: "Pick a winning source for conflicting fields with --resolve, and add --create-in for missing spools.",
  },
  {
    title: "Write",
    body: "Pass --output-dir to generate updated import files, or --apply to update Spoolman over the network.",
  },
];

export const noteGroups = [
  {
    title: "Using options",
    icon: "material-symbols:terminal",
    items: [
      "Options with values also accept <code>--option=value</code>. Use it when a filename or token starts with a dash, e.g. <code>--spoolio=-inventory.json</code>.",
      "Each source can be passed once. Use <code>--spoolman-url</code> or <code>--spoolman &lt;file&gt;</code>, not both.",
      "<code>--spoolman-token</code> requires <code>--spoolman-url</code>. Connection options and <code>--output-dir</code> may only be given once; choose one source per <code>--resolve</code> field.",
      "<code>--create-in</code> and <code>--resolve</code> require the named source to be loaded (or started with <code>--empty</code>).",
      "<code>--confirm</code> and <code>--reject</code> pairs must reference two different loaded sources and existing record IDs. A pair can't be both, and the CLI stops before writing if a confirmation would put two records from one service in the same group.",
    ],
  },
  {
    title: "Writing & errors",
    icon: "material-symbols:edit-document-outline",
    items: [
      "Writes are staged first, then each file replaces its destination by rename. Multi-file exports aren't a transaction: on failure, JSON output lists <code>written</code> files and <code>applied</code> Spoolman results. If an apply succeeds but the refresh fails, reload Spoolman before retrying.",
      `Read-only sources (${joinNames(READ_ONLY_VIEWS.map((service) => service.name))}) are used as inputs, and no file is generated for them. The output folder receives import files for writable sources (both CSV and JSON variants when supported).`,
      "Duplicate native record IDs in file inventories are rejected before matching, and input protection follows symlinks, junctions, and hard links.",
      "Import and export warnings go to stderr, and appear in <code>--json</code> output under each inventory and in <code>exportWarnings</code>.",
      "The CLI exits with a non-zero code if an option is invalid or any Spoolman apply step fails.",
    ],
  },
] as const;

export {
  SOURCE_IDS as sourceNames,
  COMPARABLE_FIELDS as resolvableFields,
} from "@spoolsync/core/core/model";
