export const NPM_URL = "https://www.npmjs.com/package/spoolsync";
export const REPO_URL = "https://github.com/robertbaker/spoolsync/tree/main/packages/spoolsync-cli";

export const inputs = [
  { flag: "--spoolman <file>", copy: "--spoolman", desc: "Spoolman JSON or CSV export." },
  {
    flag: "--spoolstock <file>",
    copy: "--spoolstock",
    desc: "Spoolstock CSV export (read-only source).",
  },
  { flag: "--spoolio <file>", copy: "--spoolio", desc: "Spoolio JSON export." },
  { flag: "--tigertag <file>", copy: "--tigertag", desc: "TigerTag .ttag backup or JSON export." },
  {
    flag: "--three-dfp <file>",
    copy: "--three-dfp",
    desc: "3DFilamentProfiles CSV or JSON export (alias: --3dfp).",
  },
  {
    flag: "--bambuddy <file>",
    copy: "--bambuddy",
    desc: "Bambuddy inventory CSV or API JSON export.",
  },
  { flag: "--filameter <file>", copy: "--filameter", desc: "FilaMeter JSON backup or CSV export." },
  { flag: "--filadex <file>", copy: "--filadex", desc: "Filadex JSON or CSV export." },
  { flag: "--filamentdb <file>", copy: "--filamentdb", desc: "FilamentDB spools JSON." },
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
    desc: "Create missing spools in loaded writable sources (comma-separated; excludes Spoolstock).",
  },
];

export const output = [
  {
    flag: "--output-dir <dir>",
    copy: "--output-dir",
    desc: "Write updated import files for file-loaded writable sources into this directory. Must differ from your input files.",
  },
  {
    flag: "--apply",
    copy: "--apply",
    desc: "Apply planned changes directly to Spoolman. Requires --spoolman-url.",
  },
  {
    flag: "--json",
    copy: "--json",
    desc: 'Print the plan as JSON, including warnings, written files, and apply results. Errors are returned as {"error": {"message"}}.',
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
    body: "Export your inventory from at least two supported tools (Spoolman, Spoolstock, Spoolio, TigerTag, 3DFilamentProfiles, Bambuddy, FilaMeter, Filadex, or FilamentDB).",
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
      "Spoolstock is read-only: its CSV is used as an input, and no Spoolstock file is generated. The output folder receives import files for writable sources (both CSV and JSON variants when supported).",
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
