# Architecture

SpoolSync has two clients: a static Astro website and a Node.js CLI. Both use the private
`@spoolsync/core` TypeScript workspace package. The website is built into `dist/` and served
as Cloudflare Workers static assets; inventory processing runs in the browser.

## Code boundaries

| Location                                        | Responsibility                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `src/pages/`, `src/components/`, `src/scripts/` | Website pages, UI, and browser interactions                            |
| `src/lib/browser/`                              | Browser session and preference storage                                 |
| `packages/spoolsync-core/src/core/`             | Common inventory model, normalization, comparison, and matching        |
| `packages/spoolsync-core/src/adapters/`         | Service formats, field mapping, and supported API clients              |
| `packages/spoolsync-core/src/workflow.ts`       | File loading, empty targets, and export orchestration                  |
| `packages/spoolsync-core/src/planner.ts`        | Resolutions and planned updates or creations                           |
| `packages/spoolsync-core/src/apply.ts`          | Remote writes and inventory refresh                                    |
| `packages/spoolsync-cli/src/`                   | Arguments, reports, output staging, and CLI execution                  |
| `e2e/`                                          | Browser workflow tests                                                 |
| `tools/`                                        | Reference checks, social assets, and the standalone TigerTag converter |

Keep shared inventory logic independent of Astro, browser storage, and filesystem writes.
Adapters describe service capabilities; clients handle presentation, credentials, and output destinations.

The browser entry scripts compose smaller UI modules. `load.ts` wires the load state, status
view, inventory table, file sources, and remote sources. `LoadState` receives an `InventoryStorage`
implementation and owns per-source request revisions, restored inventories, persistence, and
unloading. File and remote sources share those revisions so an older request cannot replace a
newer inventory or resurrect one the user unloaded. `wireRemoteSource` shares the async request
lifecycle; API bindings retain service-specific credentials, lazy adapter imports, notices, and
button-enabling rules. The inventory table module owns rendering and search.

`sync.ts` wires a `SyncSession` and separate summary, suggestion, group, filter/bulk-control, and
apply/export views. `SyncSession` receives a `SyncPersistence` implementation and owns matching,
resolution reconciliation, source selection, and group filtering without accessing browser storage
or the DOM. Views receive the session and callbacks, so field changes update the summary and plan
without rebuilding the selected radio controls. Match and bulk actions retain the full recompute
and render cycle.
Comparison rows receive a resolution and value-change callback directly; the group view retains
card composition, persistence, and status updates.

The connection wiring (`connections/wire.ts`) composes independent Spoolman and TigerTag handlers with injected adapter and
storage functions. Badge rendering, load links, password visibility controls, and CORS help have
their own modules. The handlers preserve validation, busy states, persistence, and password cleanup.
The tour entry composes step data, a `TourController` with injected `TourNavigation` and `TourView`,
and browser dialog/highlight rendering. Navigation keeps the existing query parsing, cross-page
redirects, same-page history updates, and launcher focus restoration.

The sync modules also separate presentation helpers, remote service wiring, and write orchestration.
The apply view composes per-source action controls and shared plan/log presentation. A
`DownloadController` receives export, download, and date functions; it handles alternate files,
combined warnings, status updates, and errors in one place. Format-specific filenames and explanatory
copy live in download presentation metadata, while source action controls retain their existing
enable/disable and connection checks.
`ApplyController` depends on `ApplyService` and `ApplyTarget` interfaces; its constructor receives
inventory persistence and confirmation callbacks. `createApplyServices` supplies the concrete
browser adapters and resolves current credentials for each write attempt. Keep service-specific
connection and token handling there, and keep the controller's target checks, progress, logs,
and inventory refresh handling shared across services.

## Load page

The Load page leads with one multi-file drop zone. `detectInventorySources` (core `workflow/detect.ts`)
picks the service for each file: unique header or field signatures decide first (Spool Hoarder CSV
columns, Spool and SpoolKeep JSON, Spoolio's `version` + `filaments`), then each plausible parser is
tried and only parsers that read at least one spool count. Several matches are shown as choices and
nothing is guessed. `smart-drop.ts` loads the chosen source through the same `readInventoryFile`
path as each service's own picker, so request revisions and persistence are shared.

Services are native `<details>` panels (`SourcePanel.astro`) that open when they report a message.
`source-panels.ts` adds search and filter chips, and `action-bar.ts` keeps the sticky Continue bar
in step with what is loaded; it enables once two services are loaded.

On the Sync page, a bulk answer for the pending possible matches (`SyncSession.decideAll`) saves
decisions once and needs a second click, because match decisions cannot be undone from the page.
Suggestions are still never merged without an explicit answer. The app is two pages, Load and Sync;
the former Connections page was folded into the Load panels, and `/connections` redirects to `/load`
(`public/_redirects` and Astro `redirects`).

The Spoolman and TigerTag connection forms are shared Astro components
(`src/components/connections/`) used inside the Load panels. Their wiring
(`connections/wire.ts`) is loaded the first time a panel's settings open, and dispatches
`spoolsync:connection-changed` after any save or clear. The Load page re-reads credentials at use
time on that event and, when storage dropped an API snapshot because the server or account changed,
drops the in-page copy too; file snapshots are kept.

The Differences list renders a window of 25 groups at a time (cards are built only for that window)
and can be filtered by text. The Apply section offers one button that downloads every changed file.

Match answers are saved in localStorage so the same question is not asked twice. The Sync page
shows how many answers are saved and offers "Reset my match answers" (`SyncSession.resetDecisions`),
so a mistaken answer can be taken back. The Load page has "Unload all" for clearing every service.

`combinedInventoryCsv` (core `workflow/combined.ts`) writes every loaded spool to one CSV tagged by
service; cells that spreadsheets would read as formulas are prefixed with an apostrophe because
inventory files are untrusted, and the browser adds a UTF-8 byte-order mark for Excel. The Load page
lists the four most recently loaded services first on the next visit (ordered once at startup so
the list never shifts under the cursor). `src/lib/sample-data.ts` provides two invented inventories
for first-time visitors; they are offered only when nothing is loaded, so they can never replace a
real inventory, and they are not counted as recently used.

Each file dropped on the Load page shows a collapsed preview of its first five spools and notes, so
a wrong service match is easy to spot. A `?sample=1` link stores the sample inventories only when
nothing is loaded (`applySampleParam`), then removes the parameter; the Sync page labels sample data
and offers "Copy demo link" and "Clear sample data", which also forgets match answers about sample
spools. The CLI package version and changelog are produced by `release-it` from conventional commit
messages at release time (see `.github/workflows/release-cli.yml`), so they are not edited by hand.

The Load page's loaded section starts with a card per service (`load/loaded-stats.ts`) built from
core's `summarizeInventory`, the same numbers `spoolsync --summary` prints. The CLI reads default
options from `--config <file>` (`config.ts`): keys are long option names, paths are relative to the
file, command-line options replace the same option, and secrets are refused. Shell completion
scripts (`completion.ts`) are generated from one option list that a test keeps equal to the parser's
known options.

Under those cards, `load/loaded-chart.ts` draws remaining filament per service as ranked horizontal
bars: one measure and one hue, so no legend and no dual axis. It appears only when two or more
services have weights, because one service is better as its stat card. Each bar has a value at its
tip, a hover and focus tooltip, an accessible name, and a row in a "View as table" disclosure. The
mark color is `--chart-mark` (theme.css): the brand orange in light mode and a slightly darker step in
dark mode, both validated for lightness band, chroma, and 3:1 contrast against the card surface.

The chart can group by service or by material. Each view is offered only when it has at least two
things to compare, the choice and the table disclosure are remembered in localStorage, and the
toggle hands keyboard focus to the new button after the chart redraws. The material view comes from
core's `remainingByMaterial`, which uses the same matching as the Sync page (honouring saved
answers) so a spool linked across services is counted once; the service view cannot do that, so its
subtitle says a spool listed in several services counts in each. `--quiet` with `--watch` holds each
run's output back and prints it only when it differs from the previous run.

The chart also groups by brand and is drawn on the Sync page too, redrawn with every change so a
spool you just linked is counted once. In Windows high-contrast (forced-colors) mode the bars are
solid system-colored blocks (`theme.css`), since backgrounds would otherwise be replaced by the page
color. `print.css` makes the Sync page printable: navigation, controls, and floating bars are hidden,
disclosures are expanded, cards avoid page breaks, and transitions are disabled. "Copy plan summary"
puts the per-service counts, open conflicts, and unanswered matches on the clipboard as plain text.
`shortcuts-help.ts` opens a native `<dialog>` listing the keyboard shortcuts when "?" is pressed
outside a text field, or from the footer button. Toasts sit above the sticky bars so they never cover
their buttons.

"Running low" has one definition, `isRunningLow` in core (`core/stock.ts`): a spool still in use at or
under a fifth of its full weight, or at or under 100 g when the full weight is unknown; archived and
unweighed spools never count. It feeds the stats cards, the table's Low badge and filter, the CLI
`--summary` line, and the reorder list (`workflow/reorder.ts`), which lists each low spool once using
the same matching as the chart. The loaded-spools table sorts by column (ascending, descending,
loaded order) with `aria-sort`, keeps blanks last in both directions, and returns keyboard focus to
the column's button after redrawing. The chart's "By color" view groups by `colorFamily`
(`core/color.ts`), which names a family from hue, saturation, and lightness.

`spoolsync --watch` (`watch.ts`) watches the parent directories of the input files, so saves that
replace the file are seen. A burst of changes is one run, a change during a run causes one more
run, and the exit code is that of the last run. It refuses `--apply` and `--*-url` so a service is
never written on every save. CI installs zsh and fish and sets `REQUIRE_COMPLETION_SHELLS=1`, so the
completion tests run the real shells there instead of skipping.

Keyboard and persistence conveniences are small shared modules. `shortcuts.ts` focuses a page's
primary search on "/" (service search on Load, spool filter on Sync, option search on the CLI page)
without swallowing slashes typed into a field. `source-panels.ts` remembers which service panels the
visitor opened or closed in localStorage; panels that open themselves to show a result are not saved.

Static assets are kept small: the vendor logos shown at icon size are 128 px rasters or small SVGs
rather than large traced vectors, and the bundled Inter variable font is subset to Latin, Latin
Extended-A/B, punctuation, arrows, and common symbols (about 100 KB). If a new page needs a glyph
outside that set, re-subset the font from the full Inter release.

## Adapter modules

Adapter entry points preserve their public imports while delegating to modules with narrower
responsibilities:

- TigerTag separates its schema, common-model mapping and twin grouping, file loading, record
  mutation, and file export. Cloud authentication, Firestore value encoding, the HTTP client, and
  inventory workflows are separate modules. The workflows depend on the read or write operations
  of `TigertagInventoryClient`, so they can run without an HTTP client or authentication state.
- 3DFilamentProfiles separates record mapping and validation, file loading, plan application, and
  CSV/JSON row serialization. Both output formats are derived from the same changed records.
  Record mutation and link writing share nested-property updates; CSV loss detection is independent
  of plan application and serialization.
- Spoolman separates file loading from file export. File exports and API writes share filament
  field classification, color parameters, default densities, and temperature averaging.
  `FilamentCatalog` owns vendor resolution and compatible filament reuse for one apply operation;
  spool updates remain in the apply workflow. Both accept only the client operations they need
  through `SpoolmanWriteClient` or a subset of that interface.
  The endpoint client delegates HTTP deadlines, authentication, response parsing, and browser
  request options to `HttpSpoolmanTransport` through `SpoolmanTransport`. URL and local-network
  rules live in the connection module; endpoint pagination and duplicate-ID checks remain in the
  client. Existing constructor arguments and client utility methods are preserved.
  Dotted-column coercion and merging live in `unflatten.ts`, separate from CSV/JSON parsing and
  spool validation. Existing file-loader exports still expose `unflatten`.
  Spool parameter builders and shared link extras keep API writes and file exports aligned.
  `filament-update.ts` handles shared-filament copying/reuse and unique-filament changes;
  the apply module retains write ordering, progress, logs, and completed-write counts.
- Spoolio separates schemas, material-preserving notes, common-model mapping, file loading,
  record mutation, and export assembly. The material-note rules are shared by reads and writes.
- Bambuddy separates common record validation and mapping, file loading, CSV export, and its HTTP
  client. API and file inventories use the same assembly function for spools and price warnings.
  `loadBambuddyInventory` accepts a `BambuddyInventoryClient`; `loadBambuddyApi` composes the default
  client and optionally accepts a fetch implementation.
- Filadex separates file loading, common-model mapping, record mutation, export assembly, and API
  loading. File exports and API writes use the same record mutation functions. API writes accept
  the narrow `FiladexWriteClient` interface.
- FilamentDB separates file loading, common-model mapping, record mutation, export assembly, and
  API loading. File exports and API writes share the record functions; writes accept only the
  list/save operations of `FilamentDbWriteClient`.
- FilaMeter separates document contracts, mapping, file loading, document mutation, and export
  assembly. The exporter retains backup metadata and non-filament documents while replacing only
  changed filament documents.
- SpoolMaster, Spool Hoarder, Spool, and SpoolKeep are read-only file sources, each with load and
  map modules. SpoolMaster's `.xlsx` export is read as bytes through `shared/xlsx.ts` and
  `shared/zip.ts` (stored and deflated entries, CRC-verified, via `DecompressionStream`); binary
  sources are listed in `BINARY_SOURCE_IDS`, and `loadInventoryFile` accepts text or bytes. Browser and
  CLI inputs choose bytes or text from `isBinarySource`. SpoolKeep expands its spool counts into
  individual spools, and Spool Hoarder detects its inventory or HueForge layout from the headers.

TigerTag file creation and Spoolio, 3DFilamentProfiles, FilamentDB, and FilaMeter exports accept an optional `AdapterRuntime` for
clock and ID generation. Production callers use the default runtime; tests can supply deterministic
values without replacing global functions. These interfaces use constructor or function injection;
there is no container or service locator.

`core/compare.ts` remains the public comparison and change-planning entry point. Its implementation
lives under `core/comparison/`: shared contracts, service field policies, value equality and
formatting, group comparisons and resolutions, and plan construction. Internal modules import
each other directly so the public re-export module does not introduce runtime cycles.

## CLI workflow and matching

The CLI entry point handles process arguments, version output, and error reporting. Argument
parsing, cross-option validation, help text, and match-pair syntax live in separate modules behind
the existing `args.ts` imports. `runWorkflow` composes input loading, pure plan construction, export
preparation, writes, and reporting. It receives `CliDependencies` for file reads, adapters, path
validation, staging, and remote services, and `CliOutput` for output and exit status.

Each `RemoteService` binds a source and label to load/apply operations. The default registry resolves
credentials lazily in the original service order. Exports are still serialized and validated before
staging, remote writes run before staged files are committed, and `executeWrites` retains partial
results and attempts cleanup on failure. JSON output suppresses progress messages.

`core/match.ts` preserves the public matching API while delegating to `core/matching/` modules for
contracts, stable record/group keys, source-constrained groups, identity claims, similarity scoring,
and suggestion selection. Identity claims remain all-or-nothing and prefer loaded native records;
confirmed pairs are processed before fuzzy suggestions. Stable traversal and candidate ordering
retain deterministic ties. An optional `MatchingPolicy` supplies fuzzy scoring and its threshold;
the default retains the existing rules. A policy cannot bypass source uniqueness, rejected pairs,
or the rule that suggestions do not themselves merge groups.

The standalone `tools/tigertag/spoolman-to-ttag.ts` entry point retains its CLI and exported helper
imports, with implementation modules under `tools/tigertag/converter/`. Arguments, logging, input
loading, reference lookup, record conversion, and atomic output each have a separate responsibility.
`ConverterDependencies` supplies reference loading and clock/ID generation, while
`SpoolInputDependencies` supplies file reads, fetch, and logging. Its conversion rules remain distinct
from normal inventory synchronization, including its handling of extra Spoolman metadata and
converter-specific warnings.

The public `workflow.ts` imports delegate to `workflow/load.ts`, `workflow/export.ts`, and shared
export contracts. Loading retains BOM, empty-file, SQLite, and duplicate-ID validation. Exporting
retains capability, source, and planned-change validation before invoking a lazy adapter import.
Ordinary JSON adapters share export-envelope mapping, while format-specific counts, warnings,
media types, and alternate CSV files remain explicit.

The social-card generator keeps browser rendering and image encoding in its entry script, with HTML
and styles under `tools/social-card/`. Template extraction preserves generated HTML; PNG and AVIF
encoding options and output locations remain the same. Both output directories use one encoding
loop.

`tools/check-ref.ts` composes a read-only reference audit through injected file listing, file reads,
and output functions. Modules under `tools/reference-checks/` handle metadata comparison, conversions,
field edits, repeated round trips, equivalent CSV/JSON files, and reporting. Checks are counted as
they complete, so a later failure retains prior progress. Synthetic runner tests cover this behavior
without requiring personal files from `ref/`.

## Inventory lifecycle

1. Load a service export with `loadInventoryFile`, create an empty writable target with
   `createEmptyInventory`, or fetch a supported API. Load results retain source data needed for export.
2. Match normalized spools using native and cross-service IDs. Similar records become suggestions
   that require confirmation. Unsupported fields are excluded from service comparisons.
3. Resolve field differences and select creation targets. `planSync` produces changes for each
   service; pending suggestions prevent duplicate creations. Rebuild plans after inventory changes.
4. Export with the target's load result, or apply through a supported remote adapter. Review
   warnings when an output format cannot preserve a field. Refresh remote inventories after writes.

Spoolstock is read-only. The browser supports direct Spoolman, TigerTag, and FilamentDB writes and
Bambuddy API reads; the CLI's direct API connections support Spoolman, FilamentDB, and Filadex
(Filadex needs a cookie login and sends no CORS headers, so it is CLI-only). Other writes use exported files.
See the [service table and limitations](../README.md) for format-specific behavior.

Export serialization does not itself write files. The CLI stages exports before remote writes
and commits files by rename. Multiple files and remote updates do not form a single transaction;
see the [CLI guide](../packages/spoolsync-cli/README.md) for partial failures and recovery.
Remote helpers report completed writes through `ApplyReloadError` if a subsequent refresh fails.
The CLI retains logs from earlier services when a later apply or refresh fails, skips file commits,
and cleans staging. The browser retains completed-write entries alongside the refresh failure
warning without persisting an unrefreshed inventory.

## Browser data

SpoolSync has no inventory backend or database of its own. Connections go directly from the
browser to the selected services, so local network access and CORS configuration matter.
Browser storage holds session data and preferences. Tokens may persist when the user chooses
to remember a connection or stay signed in; TigerTag passwords are not stored.

Storage's public `storage.ts` entry delegates to modules for safe storage access, inventory snapshots,
match choices, and service credentials. Shared invalidation clears API snapshots and match state
when credentials change, while retaining file snapshots. Failed snapshot persistence removes stale
data; unavailable browser storage remains safe to access.

## Website content and styles

CLI page sections live under `src/components/cli/`, with static reference data separate from the
interaction script in `src/scripts/cli-page.ts`. Source and comparable-field lists come from core.
Homepage data and the resource archive hero have dedicated modules. Blog pages share descending
publication ordering, and `post-metadata.ts` supplies article dates, topics, and structured data.

`src/styles/global.css` retains Tailwind setup and imports theme, base, table, effect, form,
accessibility, and prose styles in their original cascade order. Preserve that order when editing.
Long cohesive static data/templates and vendored components are intentionally kept intact.

## Verification

Shared package tests cover matching, planning, adapters, and workflow behavior. Browser-oriented
tests also live under `src/`, with their environment configured by `tests/setup.ts` and `bunfig.toml`.
CLI integration tests exercise the built JavaScript under Node. Playwright runs against the built
site through Wrangler on port 4324. See [CONTRIBUTING.md](../CONTRIBUTING.md) for commands.
