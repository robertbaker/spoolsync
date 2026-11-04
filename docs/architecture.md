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

## Supported tools registry

`packages/spoolsync-core/src/core/services.ts` is the single source of truth for which tools exist and
what they can do. `SERVICES` is `satisfies Record<SourceId, ServiceInfo>`, so a `SourceId` without an
entry (or an entry for an unknown id) fails to compile. Each entry holds the display names, vendor URL,
platforms, capabilities (`file-import`, `file-export`, `api-import`, `api-export`, from the service's
point of view), read and write file formats, which clients ship an API integration (`browser`, `cli`),
and the CLI options. `core/model.ts` derives `SERVICE_CAPABILITIES`, `WritableSourceId`,
`WRITABLE_SOURCE_IDS`, and `SOURCE_LABELS` from it; `SOURCE_IDS` stays the canonical id list and a test
keeps both equal. Helpers (`readSummary`, `writeSummary`, `countWord`, `SERVICE_COUNT`) produce the text
other layers show.

`src/lib/services.ts` adds the web-only half, again keyed by `SourceId`: icon, the "where do I find the
export" instructions, and card summaries. It builds `SERVICE_VIEWS`, the derived records used by the home
page's filterable "Supported tools" matrix, the Load page panels (including each file input's `accept`
attribute, derived from the read formats), the Credits page, the setup guide (`source-guides.ts`), the
site description, the tour copy, and the footer disclaimer. Raster logos are attached in
`service-logos.ts`, which only works inside the Astro build. Counts such as "thirteen tools" are
computed, never typed.

Markdown cannot import, so `tools/sync-services-docs.ts` rewrites marked regions in `README.md` and the
package READMEs: `<!-- services:start -->...<!-- services:end -->` holds the capability table and
`<!-- services:NAME:start -->` regions hold named lists, counts, and the CLI option and write tables.
Run `bun run docs:services` after editing the registry; `bun run docs:services:check` fails when a region
is stale. A unit test compares the registry with `SOURCE_IDS` and the adapter capabilities.

When adding an adapter: add its id to `SOURCE_IDS`, its entry to `SERVICES` and `SERVICE_WEB`, its logo
credit if it ships one, then run `docs:services`. Verify the read/write and API claims against the
adapter (`loadX`, `exportX`, client/apply modules) so the registry stays accurate.

## Inventory workflow and navigation

Load and Sync are one workflow, so the sidebar, bottom bar, and command palette have a single
"Inventory" entry (`NAV_LINKS` in `src/config/site.ts`). It links to `/load` and carries
`matchPaths` (`/load`, `/sync`, `/inventory`), which `isNavCurrent` (`lib/sidebar.ts`) uses so it is
highlighted on both pages. The stepper (`components/FlowSteps.astro`,
`scripts/workflow-steps.ts`) renders "1 Load, 2 Review, 3 Apply" on both pages. Its links are always
real anchors; script only adds progress. It counts inventories in session storage, listens for
`spoolsync:inventories-changed` (dispatched by `LoadState.store` and `unload`) and the URL hash
(`#tour-apply` marks Apply on the Sync page), and shows done/current/todo with a short status line.
The Load page's sticky bar ("Continue to review") remains the way forward once two services are loaded.
`/inventory` is a small no-index route that sends people to Review when two or more inventories are
loaded and to Load otherwise (a meta refresh covers scripting being off). Both `/load` and `/sync` keep
working, and `/connections` still redirects to `/load`.

`src/styles/navigation.css` holds the platform features for this area: cross-document view transitions
(`@view-transition`, only under `prefers-reduced-motion: no-preference`, with the sidebar and bottom bar
given stable `view-transition-name`s so they do not cross-fade), container queries for the stepper and
matrix, dynamic viewport units, safe-area insets for the fixed bottom bar, 44px targets, visible focus
rings, and `content-visibility: auto` on matrix rows.

### Sidebar navigation

There is no top header. `components/Sidebar.astro` renders one `<nav aria-label="Main">` plus a phone
bottom bar (`<nav aria-label="Quick links">`), and `layouts/BaseLayout.astro` mounts it in the vendored
`SiteBaseLayout`'s `before-header` slot (the vendored layout is always called with `hideHeader`, so no
starwind file is edited). Entries come from `NAV_LINKS` plus Credits; the Load, Review, Apply sub-steps come
from `WORKFLOW_STEPS`, so `src/config/site.ts` stays the single source. Pages that pass `hideHeader` to
`BaseLayout` get neither the sidebar nor the page offset.

`styles/sidebar.css` has three presentations of the same element. At 1024px and wider it is a fixed
left rail, expanded (labels) or collapsed (icons; labels stay in the accessibility tree as visually
hidden text). From 768px to 1023px it is always a rail that widens over the page on hover or
`:focus-visible` (an overlay, so layout does not move). Under 768px it is a drawer using the Popover
API (`popover="auto"`: Escape, light dismiss and focus return come from the platform; a `data-open`
attribute is the fallback), opened by the bottom bar's "More" button, which also holds Home, Inventory,
CLI and Resources. The page reserves space with `--sidebar-w` (`body.has-sidebar` pads by it), so the
main area, footer, sticky action bars (`#load-bar`, `#sync-bar`), modal dialogs (top layer) and the tour
highlight work unchanged; the tour launcher, the offline/update indicator and toasts use `md:` offsets
that match the sidebar breakpoints. `print.css` hides the sidebar and clears the padding.

`scripts/sidebar.ts` (`wireSidebar`, called first in the `BaseLayout` script) owns behavior: the
collapse button and Ctrl/Cmd+B (`[` and `]` already cycle saved views), the saved state, the drawer, the
Inventory loaded-count badge and step states (it reuses `workflowProgress` and `countLoaded` from
`workflow-steps.ts` and the `spoolsync:inventories-changed` event, with its own `data-sb-step` hooks so
it never collides with the page stepper's `data-step`), the changelog "New" badge (the version in
`spoolsync:changelog-read` is older than the running one), and the grams/ounces quick toggle. The
collapse state is `spoolsync:sidebar` (`collapsed` or `expanded`) in localStorage through
`browser/storage/access.ts`; it is listed in the Preferences group of `lib/saved-data.ts`, so it appears in
Saved settings, backups and "forget". A small inline script in the head (its CSP hash is registered in
`BaseLayout`) sets `html[data-sidebar]` before first paint so a collapsed rail does not flash open. The
tools (palette, setup guide, changelog, saved settings, shortcuts, install, theme) carry the same
`data-open-*`, `data-install-app` and `data-theme-toggle` hooks the footer used to, so the existing
wiring and palette actions find them; the footer no longer repeats them. The palette has a
"Toggle sidebar" action (`action:sidebar`), which dispatches `spoolsync:toggle-sidebar`. Pure logic (state
parsing, current-page matching, step and badge rules) is in `lib/sidebar.ts` with unit tests.

## Load page

The Load page leads with one multi-file drop zone. `detectInventorySources` (core `workflow/detect.ts`)
picks the service for each file: unique header or field signatures decide first (Spool Hoarder CSV
columns, Spool and SpoolKeep JSON, Spoolio's `version` + `filaments`), then each plausible parser is
tried and only parsers that read at least one spool count. Several matches are shown as choices and
nothing is guessed. `smart-drop.ts` loads the chosen source through the same `readInventoryFile`
path as each service's own picker, so request revisions and persistence are shared.

Services are native `<details>` panels (`SourcePanel.astro`) that open when they report a message.
`source-panels.ts` adds search and filter chips, and `action-bar.ts` keeps the sticky Continue bar (and the count of unanswered possible matches)
in step with what is loaded; it enables once two services are loaded.

On the Sync page, a bulk answer for the pending possible matches (`SyncSession.decideAll`) saves
decisions once and needs a second click, because match decisions cannot be undone from the page.
Suggestions are still never merged without an explicit answer. The app is two pages, Load and Sync,
presented as one "Inventory" workflow (see below); the former Connections page was folded into the
Load panels, and `/connections` redirects to `/load` (`public/_redirects` and Astro `redirects`).

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
outside a text field, or from the sidebar's Tools list. Toasts sit above the sticky bars so they never cover
their buttons.

"Running low" has one definition, `isRunningLow` in core (`core/stock.ts`): a spool still in use at or
under a fifth of its full weight, or at or under 100 g when the full weight is unknown; archived and
unweighed spools never count. It feeds the stats cards, the table's Low badge and filter, the CLI
`--summary` line, and the reorder list (`workflow/reorder.ts`), which lists each low spool once using
the same matching as the chart. Everything the web app remembers lives under the `spoolsync:` prefix. Small preferences go through
one validated store (`lib/preferences.ts`: table sort, running-low filter, service filter, Sync
filter), alongside the panel, chart, threshold, and recent-service entries and each service's file
history (`storage/file-history.ts`: name, size, spool count, and date of the last file, never its
contents; a browser will not reopen a file for a page, so this is a reminder). The sidebar's "Saved
settings" dialog (`lib/saved-data.ts`) lists what is stored in plain groups and can forget any group
or everything, reloading afterwards so nothing stale stays on screen. The CLI mirrors this with a
per-user settings file (`user-config.ts`: `~/.config/spoolsync/config.json`, `%APPDATA%` on Windows,
or `$SPOOLSYNC_CONFIG_DIR`). It sits beneath `--config` and the command line; its saved inventories
apply only when none are named; secrets and per-run options are never saved; writes are atomic and
private. Tests point `SPOOLSYNC_CONFIG_DIR` at a throwaway folder and pass it to spawned CLIs
explicitly, because Bun does not forward runtime `process.env` changes to children.

Opt-in auto-fetch (a preference) clicks the fetch buttons of connected services when the Load page
opens, skipping any that are not connected or already loaded. Settings can move between browsers:
the Saved settings dialog exports preferences, file history, and match answers as a versioned JSON
document and imports one back, accepting only allow-listed keys whose values pass the same
validators the pages use; credentials are never exported and a planted credential key is skipped
and reported. `spoolsync --show-config` traces each option to the layer that supplied it.

The Sync page keeps an undo and redo history (`SyncSession.checkpoint`, `undo`, `redo`) of changes
to the plan and of answers to possible matches: each value pick, "add to" checkbox, bulk action,
reset, confirm, reject, bulk answer, and answer reset takes a deep snapshot of both the resolutions
and the match answers first (50 deep), and restoring a step puts both back and saves the answers, the buttons show what they would reverse, and Ctrl or Cmd + Z
and Shift + Z work outside text fields. The sidebar's Changelog entry shows the running version (read from the CLI
package at build time) and opens a "What's new" dialog that fetches the changelog from GitHub,
parses it (`lib/changelog.ts`) into DOM without ever inserting HTML or following non-https links,
keeps a saved copy for offline use, and notes when the running version is behind. The first visit
after the version changes shows a one-time toast. The dialog (`scripts/changelog-dialog.ts`,
styled by `styles/changelog.css`) is a native modal `<dialog>` with light-dismiss: a fixed header
with the "N new since vX" badge (`spoolsync:changelog-read` remembers the version it was last opened
at), a search box and section-type chips (`lib/changelog.ts` classifies titles with `sectionKind`
and filters with `filterReleases`), sticky version chips that scroll-spy the list, and collapsible
releases (the newest two and any unseen release start open). Section kinds pair an icon with a
label so colour is never the only signal, scopes are pills, and commit links are short muted hashes.
It shows a skeleton while loading, an error panel with retry and a GitHub link, and the saved copy
with a note when offline; on phones it is a bottom sheet with safe-area insets, and its motion
switches off under `prefers-reduced-motion`. `safeUrl` accepts only https links without
credentials. `bun run release` builds the changelog with
`release-it` and conventional commits: every `feat` and `fix` commit since the last release tag,
across the whole repository (not just the CLI), is listed with its scope and commit link.
`--export-settings` and `--import-settings` read and write the same `spoolsync-settings` document
as the browser (`settings-transfer.ts`).

The threshold is a `LowStockRule` (share of full weight, plus fallback grams that scale with it) that
every caller can pass; the web app saves the visitor's choice (`lib/low-stock.ts`, 10 to 50 percent)
and the CLI takes `--low-threshold` or a numeric `low-threshold` config key. The chart also groups by
storage location, which spools without one fold into "No location". The loaded-spools table sorts by column (ascending, descending,
loaded order) with `aria-sort`, keeps blanks last in both directions, and returns keyboard focus to
the column's button after redrawing. The chart's "By color" view groups by `colorFamily`
(`core/color.ts`), which names a family from hue, saturation, and lightness.

CLI JSON reports are typed in `json-report.ts` and described by
`packages/spoolsync-cli/schema/report.schema.json`; `--format json` and `--json` are one setting.
`core/workflow/changes.ts` holds the pure rule behind the `--watch` "what changed" output
(`snapshotInventory`, `diffSnapshots`, `formatChanges`), so a browser can reuse it. `runWorkflow`
returns each run's snapshot, and `runWatch` hands the last successful one to the next run.

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

The Sync sticky bar (`sync/jump-bar.ts`) shows `Pending matches (N)` next to the ready-changes count, with
"Review matches" and "Jump to apply" links that each hide while their target is on screen.

## Sync review tools

- **Match review.** `sync/review-queue.ts` is the pure order of the one-at-a-time review: pairs keep
  the order they had when it started, a skipped pair stays pending and is offered again after the
  rest, and a pair that returns after an undo becomes current. `sync/review-mode.ts` draws it in
  the "Possible matches" section, answers through the same `decide` callback and `SyncSession`
  history as the plain list, and owns the S/D/N/Z/Esc keys. They are ignored while typing in a
  field (`isTypingTarget`) or while a dialog is open. Focus moves to the new pair's heading after
  each action, and `#review-live` announces the result. The sticky bar's "Review matches" link
  starts the review.
- **Pair comparison.** `comparePair` in `core/comparison/pair.ts` compares the fields that identify
  a spool with `valuesEqual`, and marks fields a service cannot store as not comparable instead of
  different. `sync/suggestion-card.ts` renders it as a table; a differing row says "Differs" and
  has a bar, so the mark survives forced-colors and print.
- **Plan preview.** `changeParts` and `omitExcluded` in `core/comparison/exclusions.ts` name each
  excludable part of a planned change (a field of an update, its link IDs, or a creation) and
  remove excluded parts from a plan. `SyncSession` keeps the excluded keys in its undo history but
  not in browser storage, so a reload includes every change again. The apply view draws the
  collapsible preview from the full plan and gives everything else (counts, Apply, downloads, the
  sticky bar) the filtered plan.
- **Copy as CLI command.** `deriveCliChoices` (`@spoolsync/core/cli-choices`) finds the
  `--resolve`, `--create-in`, `--confirm` and `--reject` options nearest to the plan and counts
  changes the command would add or miss, using `resolutionsFromChoices`, which the CLI also uses to
  build its plan. `sync/cli-command.ts` formats the invocation with placeholders for files, URLs and
  the output folder; tokens are never included, only the environment variable the CLI reads. The
  CLI chooses one source per field for all spools and cannot skip single changes, so the page
  states when the command differs from the plan.

## Load-page inventory insights

Three report-only checks run over the loaded inventories. None of them modifies, merges, or
exports anything.

- **Rules** live in `packages/spoolsync-core/src/workflow/` and are exported from `workflow.ts`:
  `duplicates.ts` (likely duplicates within one service), `health.ts` (missing fields and
  impossible weights), `changes.ts` (per-spool fingerprints and the diff between two loads), and
  `spool-key.ts` (the `source:id` key shared by all three). They are pure functions with
  deterministic ordering; internal modules import each other directly.
- **Duplicates** are only sought inside one service; cross-service pairs remain the Sync page's
  job. Brand, material, and colour family must agree, remaining weights must be near-identical
  (within 5 g or 2%), and the name, purchase date, or lot number must also match. Archived and
  active spools are never paired. Each group carries plain-language reasons that hold for every
  linked pair.
- **Health** flags no remaining weight, no color, brand, material, or location, negative or
  non-finite weights, and remaining weight above the full weight. `null` stays "unknown" and zero
  is a valid weight.
- **Changes since last time** compare a reloaded _file_ with a compact snapshot kept in
  `localStorage` under `spoolsync:inventory-snapshots`: per service, `[id, remaining grams, name]`
  for each spool, never the full record, notes, prices, or cross-service ids.
  `src/lib/browser/storage/insights.ts` validates the entry on every read and caps it at 2000
  spools per service and about 400 KB in total; an inventory over the cap is not remembered, and the
  panel says so, rather than storing a partial snapshot that would later report spools as added.
  API loads and sample data neither read nor write snapshots. The comparison result is held in
  memory (`LoadInsights`) and dropped when the service is unloaded or replaced by a newer load.
- **Watchlist** pins are `source:id` keys in `spoolsync:watchlist` (validated, capped at 200).
  A pinned spool whose weight dropped in the latest reload is highlighted in the table and listed
  in the watchlist panel with the text "Dropped N g", not by colour alone.
- **Saved data**: `src/lib/saved-data.ts` lists both keys as "Previous inventory summaries" and
  "Watchlist" so the saved-settings dialog can show and forget them. The watchlist is portable in a
  settings export and validated on import; snapshots hold inventory contents and are excluded.
- **Browser wiring**: `LoadInsights` (`src/scripts/load/insights.ts`) receives its storage as an
  `InsightsStorage` interface, recomputes reports on each render, and owns the table filter
  (duplicates, watched, or one health check). `insights-view.ts` renders the four panels as real
  tables and lists under `h3` headings, the changes panel as a polite live region.
  `inventory-table.ts` renders the filter chips (`aria-pressed` buttons) and the Watch toggles.
  Files report completion through the optional `LoadContext.fileLoaded` callback, called only after
  the inventory passed the request-revision check and was stored.

## Labels, trend and cost charts, and the installable app

**Labels.** `lib/labels/qr.ts` is a self-contained QR encoder (byte mode, error correction level M,
versions 1 to 10, so up to 213 bytes), with no dependency and no network. `lib/labels/labels.ts`
holds the pure rules: size presets, which spools are selected (all, those the table shows, or running
low; one label per linked spool by default), the label model, and the QR payload. The payload is only
`<service>:<id>` (for example `spoolman:12`), never names, weights, URLs, or credentials. The Load
page's `load/label-sheet.ts` owns the dialog and builds `#label-sheet` only while printing; the
`body.printing-labels` rules in `styles/print.css` then show that sheet alone. The sheet is
`display: none` otherwise, so Sync printing is unchanged. Labels are fixed black on white so codes scan
from either theme. The last size and selection are remembered under `spoolsync:label-options`.

**Trend.** Inventories live in session storage and clear with the tab, so the trend keeps only totals.
Each file or API load records `(timestamp, totalGrams, spoolCount)` per service in
`spoolsync:stock-history` (`lib/browser/storage/stock-history.ts`). Entries are validated on every
read, capped at 120 points per service, and an unchanged total is not repeated within six hours.
Sample data is not recorded. `lib/stock-trend.ts` sums each service's latest point at every moment, so
a spool listed in several services counts in each, as in the by-service chart. The history is a
"Stock history" group in `lib/saved-data.ts`, so it can be forgotten, exported, and imported with the
other portable settings (imports are validated).

**Cost per kilogram.** `CommonSpool.price` is a whole-spool purchase price in the service's own
currency. `costPerKg` in `@spoolsync/core/workflow` divides total price by total full weight per
service, material, or brand (linked spools counted once for the last two) and reports how many spools
could not be priced. When nothing carries a price the chart says why instead of hiding. There is no
currency conversion.

Both charts follow `load/loaded-chart.ts`: one hue from `--chart-mark`, no legend, a tooltip and an
accessible name per mark, a "View as table" alternative, and system colors under `forced-colors`.
`load/chart-parts.ts` holds the shared bar row and view switcher.

**Installable app.** `public/manifest.webmanifest` and the PNG icons in `public/icons/` (generated
from `public/favicon.svg` by `bun tools/generate-pwa-icons.ts`; commit the output) make the site
installable. `tools/pwa/integration.ts` is an Astro integration that, after the build, fills
`tools/pwa/sw.js` with a content-hash version and the list of shell pages, scripts, styles, fonts, and
icons, and writes it to `dist/sw.js`. `public/_headers` already serves `/sw.js` and the manifest with
`no-cache`, and Workers assets serve both with the site's CSP (`worker-src` falls back to
`script-src 'self'`). The worker only handles same-origin GET requests, so Spoolman, TigerTag, the
changelog, and any other cross-origin request bypass it; responses with `Set-Cookie`, `no-store`, or
an `Authorization` request are never stored. Pages are network-first with the saved copy (or
`/offline`) as fallback; hashed files are cache-first; each build uses its own cache name and
`activate` deletes older ones. A new worker waits: `scripts/pwa/controller.ts` shows "Reload to
update", which posts `SKIP_WAITING`, and the page reloads once the new worker controls it. The
worker registers only in production builds (`import.meta.env.PROD`), so `astro dev` never caches.
The sidebar's Install button appears on `beforeinstallprompt`, and an indicator shows when the browser
is offline. Playwright runs with service workers enabled, matching production.

## Spool drawer, saved views, and reorder list

**Spool detail drawer** (`load/spool-drawer.ts`, logic in `lib/spool-detail.ts`). Clicking a table row,
or its name button for keyboard users, dispatches `spoolsync:open-spool` on `document` with
`{ key }` (a `spoolKey`); anything else, such as a command palette, can dispatch the same event.
The drawer is a native modal `<dialog>` docked right, so focus is trapped, Esc closes it, and focus
returns to the row's name button (found again by `data-open-spool`, since the table is redrawn).
`findSpoolDetail` uses the Sync page's matching (`findMatches`, honouring saved answers) to collect
every loaded record of the spool, then `detailRows` lays out each field by service and flags rows where
the services disagree. Weights go through `formatWeight` and prices through `formatMoney`, and the
drawer redraws on `DISPLAY_CHANGED`. History is what is actually stored: the weight change since the
previous file load (from `LoadInsights.changes`) and the last few per-service totals from stock
history; no per-spool history is kept. "Mark as different" lists same-service duplicates, pending
match suggestions, and answers the visitor confirmed; it writes the pair to the shared match
decisions (`markDifferent` removes an earlier "same" answer), which only stops suggestions. Printing
a label reuses `printLabelSheet` from `label-sheet.ts`.

**Saved views** (`load/views-panel.ts`, logic in `lib/saved-views.ts`). A view is a named
`ViewSettings`: search text, running-low, insight filter, sort, grouping, a material substring, and a
minimum and maximum remaining weight in grams (always grams, whatever the display unit; spools with
no weight fail any weight bound). The table exposes `getViewSettings`, `applyViewSettings`, and
`onRender`, so the panel never touches table state directly. Views live under `spoolsync:saved-views`
(at most 30, names unique ignoring case, 60 characters), are sanitized on every read, and are part of
the Preferences group in Saved settings and settings export. Grouping inserts a header row per group
and keeps the chosen sort inside each group. If storage is blocked the panel keeps the views for the
visit and says so.

**Reorder list** (`load/reorder-panel.ts`, logic in `lib/reorder-list.ts`). Built from core's
`reorderItems`, so it uses the same low-stock rule and linked-spool matching as "Copy reorder list",
then grouped by brand (case-insensitive, no-brand last). Search links are
`https://www.google.com/search?tbm=shop&q=brand+material+name`, built with `URLSearchParams` and opened
with `rel="noopener noreferrer"`; nothing from the inventory is sent until the visitor clicks. The CSV
neutralizes cells that start with a formula character like `combinedInventoryCsv` does. The printable
view builds a plain `#reorder-sheet` and sets `body.printing-reorder`, which `print.css` uses to print
the sheet alone, as it does for labels.

## Sync page: bulk edits, history, and touch review

**Bulk edits.** Core `core/comparison/edits.ts` defines `BulkEdit` (`location`, `note`, `tag`,
`remainingWeight`; a property left `undefined` is not edited, `null` clears the field, so only an
explicit clear writes an empty value) and its sanitizer. `remainingWeight` is a finite number of
grams from 0 to `MAX_EDIT_GRAMS`; it can set a weight but never clear one, and it is not in the
Sync page's bulk-edit form: only the Load page's weigh-in calculator stages it (see "Load-page
tools" below). Like the other keys it is written only to services whose adapter stores
`remainingWeight` (`SOURCE_FIELDS`), is compared with the field's usual tolerance, and shows in
`describeBulkEdit` as `remaining 320 g`. `buildPlan` and `planSync` take an optional map of edits by group
id: an edit overrides the resolved value for `location` and `comment` before the usual
`SOURCE_FIELDS` check, so a service whose adapter has no place for the field is skipped, unknown
fields and warning text are untouched, and created spools carry the edit too. A tag is a `#tag`
word added once to each member's own note (services keep no separate tags), after any note
replacement. Without edits the plan is identical, so the CLI is unchanged. `reconcileBulkEdits`
carries edits across groups that grow or merge (merged groups keep only parts that agree).
`SyncSession` owns the edits and the selection (selection is per visit; edits are in the undo history
and saved per tab in `storage/bulk-edits.ts`, cleared with the resolutions when a connection
changes). `bulk-edit-view.ts` is the panel above the Differences list; cards have a "Select for bulk
edit" box. The plan preview marks fields that came from a bulk edit and can clear one per spool, and
because the same plan feeds Apply, downloads and the CLI-command check, they all see the edits.
"Copy as CLI command" cannot reproduce a bulk edit and says so through its existing caveat.

**History.** `storage/sync-history.ts` keeps the last 100 applies and downloads under
`spoolsync:sync-history`: time, service, API or download, planned updates and creations, succeeded
and failed counts, and a short control-character-free error. Entries are sanitized on every read and
never hold spool details. `ApplyController` (fifth constructor argument) and `DownloadController`
(`record` dependency) call it when a run finishes; a cancelled or refused apply records nothing, and
a failing recorder never hides the result. `history-view.ts` lists it newest first under Apply with
"Copy summary" (`clipboard.ts`: async clipboard, then a legacy fallback) and "Clear history".

**Touch.** `swipe.ts` holds a pure `SwipeTracker` and `attachSwipe`. In the one-at-a-time match
review, a touch or pen swipe right answers "same spool" and left skips (it stays pending); the card
keeps `touch-action: pan-y`, so a mostly vertical movement is left to scrolling, and mouse input and
gestures that start on a control are ignored. Buttons and the S/D/N/Z keys remain, results are
announced through the existing live region, and `prefers-reduced-motion` stops the card moving.
`styles/sync-touch.css` makes Sync page controls, table choices, and previews at least 44px tall on
coarse pointers or narrow screens.

## Command palette, display units, setup guide, and import reports

`src/scripts/palette/` is mounted from `BaseLayout.astro` and opens with Ctrl/Cmd+K (or the sidebar's
Command palette button). `rank.ts` holds the pure ranking: normalized (accent- and case-insensitive) fuzzy scoring in
which every word must match, title matches counting double, ties keeping their original order,
recent choices first for an empty query, and spools listed only when a query is typed. `items.ts`
turns loaded inventories (read with `readLoadResult`, so it works on any page) into entries, and
`commands.ts` lists pages, Load panels, and actions. Actions click the controls that already exist
(theme toggle, `[data-open-shortcuts]`, `[data-open-saved-data]`, `[data-open-changelog]`,
`[data-tour-launcher]`, `#download-combined`, `#unload-all`) and are omitted when the current page
does not offer them or the control is hidden. Choosing a spool dispatches `spoolsync:open-spool`
with `{ key }` on `document`; from another page the palette goes to `/load?spool=<key>` and
dispatches the event once the page has loaded. `/load?panel=<id>` opens a service panel the same
way. The dialog is a native `<dialog>` with a `combobox` input and `listbox` results
(`aria-activedescendant`), and returns focus to the element that opened it.

`src/lib/units.ts` stores the weight unit (g or oz) and a price display symbol under
`spoolsync:display` and fires `spoolsync:display-changed`. The controls live in the Saved settings
dialog (`scripts/display-settings.ts`). Stock cards, the remaining-weight chart, the trend chart, and
the cost chart format through it, and `load.ts` re-renders on the event. Weights are always stored and
computed in grams. The currency setting is only a display symbol: prices stay in each service's own
currency and are never converted, and the setting says so.

The first-run setup guide (`scripts/setup/`) is a dialog on the Load page that opens when nothing is
loaded, it has not been dismissed (`spoolsync:setup-dismissed`), and the URL has no purpose of its
own (`?sample`, `?tour`, `?spool`, `?panel`). Browser automation (`navigator.webdriver`) never gets it
unprompted, so end-to-end tests are not blocked by a modal; `/load?setup=1`, the sidebar's Setup guide entry, and the
palette open it on request. Step one picks apps, then one page per app shows that service's export
instructions, and the last step opens the page's `#smart-file` multi-file picker so detection and
request revisions are shared with every other load. The instructions come from
`src/lib/source-guides.ts`, which `load.astro` also reads, so the wording lives in one place.

`buildImportReport` (core `workflow/import-report.ts`) classifies a `LoadResult`'s existing warnings
into skipped rows (with row or record location and reason), values the importer filled in, and
file-wide notes, and counts rows read. It only reads warnings, so adapters, warning text, and the
`LoadResult` shape are unchanged. The Load page shows it as a collapsed "Import report" under each
loaded file (`load/import-report-view.ts`) with a CSV download whose cells that start with `=`, `+`,
`-`, `@`, tab, or carriage return are prefixed with an apostrophe.

On small screens the sidebar component's bottom bar and drawer (see Sidebar navigation) provide the
navigation. `styles/touch.css` raises the Load page's table
buttons, links, filter chips, and toolbar buttons to at least 44 px on coarse pointers and narrow
windows without touching `inventory-table.ts`.

## Data cleanup

Core's cleanup engine (`core/cleanup/`, public entry `core/cleanup.ts`) is pure and deterministic: it
reads `CommonSpool` records and returns proposals and warnings, and never changes a spool. A rule is
`{ id, label, description, run }`. Rules run in a fixed order (`CLEANUP_RULE_IDS`: whitespace,
casing, vendor-alias, material, material-variant, diameter, color-hex, price, weight, temperature,
barcode, date) and each sees what the earlier ones produced, so a field ends with one proposal whose
`before` is the stored value and whose `after` is the end of the chain. Turning a rule off removes its
step. A proposal carries `id` (`source:sourceId#field`), spool key, field, before, after, the deciding
`rule` plus every rule that touched it, `confidence`, `reason`, an optional `bundle`, and `applicable`.

- **safe** means only form changes (case, spacing, punctuation, a format with one reading, rounding
  noise); **review** means a judgement (alias, unit conversion, `Nylon` to `PA`, a snapped
  diameter, a finish moved from material to name, a reversed temperature range). Bundled proposals
  (a finish moved to the name; swapped min/max temperatures) share the most cautious confidence and
  are accepted or rejected together.
- Casing only rewrites text that is entirely one case, so `PolyMaker` and `eSUN` are never
  "fixed" by it. Brand spellings come from `vendors.ts` (an extensible alias table matched ignoring
  case, accents, punctuation and legal suffixes; `CleanupOptions.vendorAliases` overrides it) and
  material words from `materials.ts` (`PLA+`, `PETG-CF`, `ABS-GF`, `PA12`, `TPU 95A`; unknown or
  blended materials are never touched).
- Prices, weights, diameters, temperatures, colors, barcodes and dates are parsed by `numbers.ts`,
  which returns `null` rather than guessing (`1.299` with no decimal context is flagged as
  ambiguous and needs review). Colors are written `RRGGBB`; an alpha channel is dropped, with review
  when it was not fully opaque. Currency is read but SpoolSync stores only the amount.
- Values that look wrong but have no single fix (negative or zero price, remaining above full,
  a net weight under 10 g that looks like kilograms, odd diameters, temperatures out of range,
  spreadsheet-mangled barcodes, future purchase dates when `today` is given) are `warnings`, never
  proposals. Empty strings and `null` are never converted into each other, notes keep their line
  breaks, and the engine reads no field outside `COMPARABLE_FIELDS`, so unknown source fields and
  cross-service IDs stay untouched.

Accepted proposals reach the plan through a sibling of bulk edits, `RecordEdits`
(`comparison/record-edits.ts`): field values keyed by record key (`source:sourceId`) because a
cleanup belongs to one service's record, not to a matched group. `buildPlan`/`planSync` take it as an
optional last argument. A record edit fills a field only when the person has not resolved that field,
is written only where the service is writable and stores the field (`SOURCE_FIELDS`), and is
compared exactly (`strictValuesEqual`), because the comparison's `valuesEqual` ignores case and spacing
and would otherwise drop `esun` to `eSUN`. A bulk edit tag is added on top of a cleaned note.
`AcceptedCleanup` (`spoolKey`, `field`, `before`, `after`) is what is stored; `recordEditsFromAccepted`
drops entries whose spool is gone, whose value changed since, or whose service cannot take the field.
`workflow/cleanup.ts` reuses the Load page's duplicate detection on a copy with accepted changes
applied and reports groups that only appear afterwards (report only; nothing is merged).

The Load page's "Clean up data" panel (`load/cleanup-view.ts`, `#cleanup-panel`, a
`details[data-panel="cleanup"]` so the palette's `?panel=cleanup` landing opens it) is a view over
`CleanupController`, which owns the rule toggles, the filters (rule, confidence), per-item
accept/reject/reset, "Select all safe", and undo. It reads and writes storage through a
`CleanupStore`: rule toggles in `spoolsync:cleanup-settings` (localStorage, a preference), accepted
changes in `spoolsync:cleanup-accepted` (sessionStorage, like the Sync choices), both through
`lib/browser/storage/cleanup.ts` and registered in `lib/saved-data.ts`. Choices for services that are
not loaded right now are held, not discarded. Weights and prices are shown with `lib/units.ts`. The
Sync page reads the accepted list once at startup, plans it with the rest, shows a notice with the
count, and each change can still be left out like any other.

In the CLI, `--cleanup[=rules]` runs the engine over the loaded spools and passes the safe,
applicable proposals to `planSync` as record edits (`cleanup.ts`, `planning.ts`), so exports and
`--apply` follow the plan unchanged; `--cleanup-report[=rules]` prints every proposal and warning
and, on its own, plans nothing and accepts a single inventory (the `"inventory"` report gains a
`cleanup` object, as does the `"compare"` report). Rule lists share `parseRuleSelection`. Matching
still uses the values as loaded, so cleanup can change what a later run matches.

## Reference data

Reference data matches the loaded spools to a catalog of filaments (a file the person loads, or a
service they configure) to fill in what is missing, offer corrections, and check colors. Core's
`core/reference/` (public entry `core/reference.ts`) is pure and provider-neutral; it never changes a
spool and never knows a provider's wire format.

**Model.** `ReferenceFilament` is the one normalized record: vendor, product name, canonical material,
color name, `colorHex` (and `colorHexes` for multi-color), diameter, density, nozzle and bed
temperatures, net and empty-spool weight, list price, barcode, `https:` URL, provider id and label,
and the `attribution` and `license` strings that stay with every record. Values the source does not
state are `null`, never guessed. `mapping.ts` turns a raw record into it: a `ReferenceMapping` is
plain data (a records path, per-key lists of paths, a weight unit), paths are dotted with `[n]`
indexes, and keys match exactly and then ignoring case, punctuation and a unit in brackets. The
built-in `GENERIC_MAPPING` carries preset aliases for the documented reference-file schema
(`brand`/`vendor`/`manufacturer`, `material`, `color_name`, `hex`, `diameter`, `density`,
`nozzle_temp_min`/`_max` or a `nozzle_temp` range, `bed_temp_*`, `net_weight`, `spool_weight`,
`price`, `barcode`/`ean`/`upc`/`gtin`, `url`). `normalize.ts` reuses the cleanup parsers
(`parseWeight`, `parseTemperature`, `normalizeHex`, `parseMaterial`, ...): out-of-range values are
dropped with a warning, a finish such as "Silk" moves from the material to the product name, a hex
column is told apart from a color-name column, bare weights of 10 or less are kilograms, and ids come
from the source or a stable content hash (repeats get `#2`). `file.ts` reads JSON (a list, or an
object holding one, optionally with `attribution` and `license`) or CSV with the same mapping.

**Matching.** `ReferenceCatalog` holds records in a fixed order (vendor, material, color name, name,
id) and indexes them by brand identity (cleanup's vendor-alias table, so `PRUSAMENT inc` finds
`Prusament`; extra aliases are an option) and by barcode. `match(spool)` scores each candidate out
of 100 with the reasons kept: brand 30, material 20 (a different polymer excludes the record, a
variant such as `PLA+` against `PLA` scores less), name 35 (Dice similarity on word sets, ignoring
case, order, accents, brand and polymer words), color 8, diameter and spool size as tie-breakers,
barcode 60. The result is ordered by score then id and has a status: `matched` (one candidate clearly
ahead, at least 75), `ambiguous` (rivals within 8 points), `suggested` (one weak candidate), or
`none`. Only `matched` is used unasked. Ambiguous and suggested spools wait for a person's choice
(a record, or "none of these"), which is stored and checked against the candidates on every refresh,
in line with "suggestions never merge groups automatically".

**Diff, policy and proposals.** `analyzeReference` compares the policy's fields for the selected
record: a field is `missing` (empty, or `0` for diameter, density, temperatures and weights, which
services store for "unknown"), `differs`, or `same` (case, spacing, word order, tolerances and a
color within the match threshold do not count). A `ReferencePolicy` lists the fields the reference
may touch and the subset that may replace an existing value; the default fills missing values only and
leaves out the brand (the matching key) and the price (what was paid is not a list price). Each
proposal has the cleanup proposal's shape (`id` `source:id#field`, before, after, confidence, reason,
`applicable` through cleanup's `canApplyCleanup`) plus `kind` (`fill` or `overwrite`) and the
reference id. A fill from a confident, unchosen match is `safe` (the CLI may apply it); everything
else, including every overwrite and any fill from a person's choice, is `review`. Accepted entries
are `AcceptedReference` values (`spoolKey`, `field`, `before`, `after`, provider, reference id);
`referenceEditsFromAccepted` drops entries whose spool is gone or changed or whose service cannot
take the field and returns `RecordEdits`, and `mergeRecordEdits` combines them with accepted
cleanups (later wins a shared field; reference data goes last).

**Color.** `core/color.ts` has CIEDE2000 (`deltaE2000`, `deltaE2000Lab`, tested against the pairs in
Sharma, Wu and Dalal 2005). `color-check.ts` classifies a distance: up to 2.3 is a match, up to 5
close, above 5 a mismatch; several colors compare pairwise and use the worst, and a different number
of colors is always a mismatch. A separate plausibility check uses `colorFamily`: a color word in a
name (`Red`, `Gold`, `Navy`) is checked against the hex's hue family with neighbor tolerance, so
`Red` on a blue hex is flagged and `Galaxy` or `Natural` (no color claim) are `unknown`. It is applied
to the spool's own name and hex and to the reference's, and a reference color that contradicts its own
name is never filled as `safe`.

**Providers.** `providers.ts` declares three providers, all `ready`. `file` reads a loaded file.
`openfilamentdatabase` and `filamentcolors` ship a verified endpoint, paging and `ReferencePreset`
(`defaults` on the provider; checked against the live APIs on 2026-11-04). A person can still
override the address or enter a JSON mapping in the panel; the verified mapping applies only to the
built-in address with no mapping entered.

- _Open Filament Database_ (https://openfilamentdatabase.org/docs, MIT, attribution appreciated)
  publishes static JSON with open CORS. SpoolSync reads the bulk file
  `https://api.openfilamentdatabase.org/json/all.json` (about 3.4 MB compressed, 16 MB raw) in one
  request. The file is relational (brands, materials, filaments, variants, sizes), so the provider's
  `prepareDocument` (`reference/ofd.ts`, `flattenOpenFilamentDatabase`) joins it into one record per
  size; the mapping (`OFD_MAPPING`) then reads brand, filament name, material, color name and hex
  (`color_hexes` for multi-color), diameter, density, nozzle and bed temperatures, net and empty
  spool weight (refill sizes claim no spool) and the GTIN. It states no list price or product page.
  About 24,000 records fit the browser cache because it uses IndexedDB (see below).
- _FilamentColors_ (https://filamentcolors.xyz/api/, open CORS, data license not stated, shown as
  such) is a paged list at `/api/swatch/?page_size=100` (page size 100 is its maximum; 23 requests,
  followed by the `next` link). A swatch is one measured product color: brand, material
  (`filament_type.name`), color name, `hex_color` and a purchase link. It carries one typical
  temperature per filament _type_, not per product, so temperatures stay unmapped rather than
  presented as the product's. It states no weight, diameter or barcode.

**Snapshots and update checks.** Neither service should be asked for its whole catalog by every
visitor, so the catalog is kept in three layers, newest data first:

1. _Build time._ `bun run snapshot:reference` (run by `bun run build`; `tools/reference-snapshot.ts`
   and `tools/reference-snapshot/build.ts`) fetches both catalogs with the same core code and writes
   `public/reference/<provider>.json` (git-ignored, served with the site; `SKIP_REFERENCE_SNAPSHOT=1`
   skips it). The format (`reference/snapshot.ts`) is a column list plus rows with the constant fields
   stored once: the Open Filament Database shrinks from 16 MB of JSON to about 3.5 MB (850 KB
   compressed). A build never fails because a service is down: the snapshot on disk is kept, a
   response under half the old size is distrusted unless `--force`, and a site built without a
   snapshot fetches live. A rebuild is skipped when the service's freshness token is unchanged. The
   snapshot is only as new as the last deploy; deploy regularly (the Open Filament Database
   rebuilds daily) and visitors still get newer data through layer 3.
2. _In the browser._ A catalog the browser has seen is kept in IndexedDB (`storage/catalog-db.ts`;
   the 24,000 Open Filament Database records are far past localStorage's 5 MB), with a small
   description (`ReferenceCacheMeta`: key, time, TTL, credit line, freshness token, count, and
   whether it came from the snapshot or the service) in `spoolsync:reference-cache`. The description
   is written only after the records are stored, and records are re-validated on read. Earlier
   versions kept records in that key; they are dropped on first read. "Forget" in Saved settings also
   empties the database.
3. _Update checks._ Each provider has a `freshness` request (Open Filament Database: `api/v1/index.json`,
   token `generated_at`; FilamentColors: `?page_size=1`, token `count:firstId:firstPublishDate`, so a
   swatch edited in place is only picked up by "Fetch again"). `ReferenceController.fetchProvider`
   takes the newer of the kept copy and the snapshot; while it is under the TTL (default 24 hours)
   nothing else happens. Once stale it makes the one small request: an equal token keeps the copy and
   marks it current (`touchCache`), a changed token downloads the catalog and keeps it, and an
   unreachable service keeps the copy and says so (`CatalogInfo.note`); a failed download falls back to
   the older copy the same way. "Fetch again" downloads regardless. Snapshots and checks apply only
   to the provider's built-in address, paging and mapping (`buildFetchConfig(...).builtIn`); a custom
   address is fetched and cached as before.

**Fetching.** `fetch.ts` is generic and uses injected `ReferenceIO` (`fetch`, `sleep`, `now`). The
endpoint is `https:` only, with no embedded credentials and a real host; `{offset}`, `{page}` and
`{limit}` are filled in. Paging is none, a next-link path in the response (followed only within the
configured origin, with a loop guard), a record offset, or a page number, bounded by a page cap and a
record cap. Requests are paced (`minIntervalMs`), 408/425/429/5xx are retried with exponential backoff
that honors `Retry-After` (capped), a lost connection is retried once, and an `AbortSignal` stops
waits and requests. Only an `Accept` header is sent, so the request needs no CORS preflight; the
browser implementation (`lib/browser/reference-io.ts`) sends no cookies or referrer. A browser reports a
blocked cross-site request like a lost connection, so that error carries CORS help pointing to the file
option. `cache.ts` describes a kept catalog by its `fetchedAt`, TTL (default 24 hours, `0` always checks),
credit line and a key over the endpoint, mapping and paging, so a changed setting misses the cache;
stored records are re-validated on read. `settings.ts` sanitizes everything saved.

**Load page.** The "Reference data" panel (`load/reference-view.ts`, `#reference-panel`, a
`details[data-panel="reference"]` so the palette's `?panel=reference` landing opens it) is a view over
`ReferenceController`, which owns the catalog, the policy, the filters (everything to review, missing,
differs, color check, needs a choice, no match), per-field accept/reject, "Fill all missing" and
"Overwrite selected" (both act on the spools in view), candidate choices, and undo. Cards show the
spool beside the reference record with swatches, the CIEDE2000 distance, the name/hex warnings and
each proposed field. Loading is guarded by a request revision: a newer file load, fetch or `cancel()`
makes an older response stale and it is discarded without touching state. Storage goes through
`lib/browser/storage/reference.ts` and is registered in `lib/saved-data.ts`: the provider, policy and
per-provider endpoint settings in `spoolsync:reference-settings` (a portable preference), a fetched
catalog in `spoolsync:reference-cache` (its own group, device only, never exported), and accepted
changes and picked records in `spoolsync:reference-accepted` and `spoolsync:reference-choices`
(sessionStorage, like the cleanup choices). A catalog loaded from a file stays in memory; after a
reload the accepted changes are held (not discarded) until the same reference is loaded again. The Sync
page validates the accepted entries against the loaded values, merges them with the cleanup edits,
shows a notice with the count, and each change can still be left out like any other.

**CLI.** `--reference <file>` adds the safe, applicable fills from confident matches to the plan as
record edits (it needs two inventories, like `--cleanup`); `--reference-report <file>` lists every
match, proposal (including would-be overwrites), ambiguous choice and non-matching color, and alone
plans nothing and works with a single inventory. The CLI reads only the file given and never contacts a
reference service. Both are path keys in `--config` files, appear in the completion specs, `--help`,
the report schema (a `reference` object in both report kinds) and `src/components/cli/data.ts`.

## Load-page tools, backup, and shared styles

**Weigh-in calculator.** The spool drawer has a "Weigh in" section (`load/weigh-in-panel.ts`, pure rules
in `lib/weigh-in.ts`). The visitor types the scale reading and the empty-spool weight (both in the
display unit, converted with `units.ts`); the result is the remaining grams, the percentage of the
full weight, and the difference from the recorded weight, with a warning above the full weight. The
empty weight starts from the visitor's saved value for the brand, then the empty weight the
inventory records for the spool, then a typical value from a small brand table (`KNOWN_TARES`,
rounded and labelled as typical). Saved values live under `spoolsync:weigh-in` as `{ tares: {
brandKey: grams } }`, validated by `sanitizeTares`. "Stage as edit for Sync" calls
`stageBulkEdit` (`storage/bulk-edits.ts`), which merges `{ remainingWeight }` into the session-stored
bulk edit of the spool's match group (`SpoolDetail.groupId`); the Sync page then plans it like any
bulk edit. The button is disabled when no member is in a service that stores a remaining weight
(`SpoolDetail.canStageWeight`). Nothing is written to a service from the Load page.

**Inventory report.** `lib/inventory-report.ts` builds the report from `uniqueSpools` (a spool linked
across services counts once): totals, percent left, a split by material and by brand, spools running
low under the current threshold, and spend and remaining value from recorded prices (no currency
conversion). Weights and money are formatted through an injected `ReportFormat` built from
`units.ts`, and the CSV names its unit in the headers and defuses formula cells. `load/report-panel.ts`
adds an "Inventory report" button beside the combined CSV button, a dialog preview, and print (a
body-level `#inventory-report-sheet` shown only under `body.printing-report`, like the label sheet),
HTML (the same DOM serialized into a standalone document), Markdown and CSV downloads.

**Since your last visit.** `LoadInsights.fileLoaded` already diffs a freshly loaded file against the
snapshot of the previous one. `lib/since-visit.ts` turns that diff into a compact `VisitSummary` per
service (counts plus up to 40 listed spools), keeps it under `spoolsync:since-visit` so the panel
survives a reload, and drops it as soon as the service holds a different inventory than the one it
describes (`currentVisits`). `load/since-visit-panel.ts` draws the panel above the insights: filament
used or added back, the biggest movers (opening the spool drawer), additions and removals, and a
copyable text summary. It holds ids, names and weights only, like the snapshots, and is listed with
them in the saved-data dialog and never exported.

**Backup and restore.** `lib/saved-data.ts` adds `createBackup`, `inspectBackup` and `restoreBackup`
(`spoolsync-backup`, version 1; files from the older `spoolsync-settings` export also restore). The
file holds the same portable groups as the settings export, and every entry is validated by key with
`isValidEntry` both when written and when read; connections, tokens, snapshots, since-visit data,
sync history and tab-only inventories are never included or restored. The reader checks the outer
shape and size limits (`BACKUP_LIMITS`), reports what would be restored and why entries are skipped,
and only then writes, merging into or replacing the portable settings. `scripts/backup-section.ts`
is the dialog section: download, choose a file, review, confirm.

**Smaller additions.** Saved views can be shared as `?view=` (compact JSON in base64url, parsed with
`decodeViewParam` through `sanitizeSettings`, applied once when spools are first on screen, then
removed from the address) and stepped with `[` and `]` (`cycleView`). The reorder list accepts a
shop link template (`validateShopTemplate`: https only, `{brand}`, `{material}` and `{color}`, none
in the host name; each part is percent-encoded by `expandShopTemplate`), stored under
`spoolsync:shop-template`, and falls back to web search when it is missing or invalid. The command
palette ranks `aliases` like titles, lists recently chosen commands and spools first under "Recent"
when opened empty, and has actions for the report, weigh-in, since-last-visit, the reorder list, view
links, history export and backup or restore. Sync history can be filtered by service, method,
result and words (`filterSyncHistory`) and exported as `spoolsync-sync-history` JSON, counts and
short errors only.

**Shared styles.** `styles/modern.css` gives the modal dialogs one radius, shadow, backdrop and
scroll containment, and a shared entry and exit transition (`@starting-style` with `allow-discrete`
for `display` and `overlay`) behind `prefers-reduced-motion: no-preference`. It also sets
`color-scheme`, balanced and pretty text wrapping, tabular numbers, toast safe areas and tone edges,
and the `.skeleton` and `.empty-state` blocks that Load-page panels use. `styles/features.css`
holds the report, weigh-in and since-visit styles. The new storage keys (`spoolsync:weigh-in`,
`spoolsync:shop-template`, `spoolsync:changelog-read`, `spoolsync:since-visit`) are registered in
`SAVED_GROUPS`.

## Data health dashboard

`#health-dashboard` (Load page, above the charts) turns the existing checks into one score and a
to-do list. `lib/health-score.ts` is pure: `computeHealthScore` takes counts (the eight
`HEALTH_ISSUES`, spools without a price, spools in a possible duplicate group, spools with an
applicable cleanup suggestion) and returns a 0 to 100 score, a grade (excellent from 90, good from
75, fair from 50, poor below), and the factors that cost points. Each factor costs
`HEALTH_WEIGHTS[factor] * affected / spools`; the weights add up to 100 (impossible values 30,
missing weight 15, duplicates and cleanup 10 each, color, brand and material 8 each, price 7,
location 4), so the score means the same for 20 and 2,000 spools and a fully broken inventory scores 0. It never reads 100 while any spool needs a look. Nothing loaded gives no score.

`scripts/load/health-dashboard.ts` renders it. The meter is a `role="meter"` with `aria-valuenow`,
`aria-valuetext` ("78 out of 100, Good") and a visible grade, so the color is never the only signal;
a separate `role="status"` region speaks only when the score changes (never on the first draw). The
to-do list is ranked by points. A factor button filters the inventory table through the same
`LoadInsights` filter the chips use (toggling with `aria-pressed`, scrolling the table into view
without animation under reduced motion); the cleanup factor opens the cleanup panel instead. Missing
prices are not a core health check (a price is optional in most services), so `LoadInsights` tracks
them as the extra `missing-price` filter, which saved views accept. The summary shows the tracked
filament weight through `formatWeight`, so it follows the grams or ounces setting. `wireCleanupPanel`
now returns `applicableSpools()`, which feeds the cleanup input; the dashboard draws after the panel
updates.

The trend is `lib/browser/storage/health-history.ts` (`spoolsync:health-history`): at most 60
points of `{ at, score, spools }`, sanitised on read, and a point equal to the last one is skipped
for six hours. One point is recorded per distinct set of loaded files and result, so redraws never
add history. The chart is a small SVG on a fixed 0 to 100 scale with an `aria-label` and a
sentence ("Up 12 points since Oct 3, 2026"). The key is in the "Stock history" saved-data group and is
portable in settings exports and backups.

## Generic import column mapper

A CSV or JSON file that smart-drop cannot assign to a service shows a "Map columns..." button next
to the "was not recognised" line (`isMappableFile`: csv, tsv, txt, json). The dialog
(`scripts/load/import-mapper.ts`) reads the file as a table, lets the person match each header to a
field (brand, material, color name, color hex, remaining, used or full weight, empty spool weight,
price, location, lot, notes, archived, diameter, density, article number), and offers a weight unit
(g, kg, oz, lb).

**Decision: converter, not a source.** The mapper does not add a `SourceId`, does not touch
`core/services.ts` or `lib/services.ts`, and never loads the mapped file as an inventory. A
read-only comparison source would need a registry entry, a capability row, a Load panel, a
planner/export behavior and CLI parity, and the registry is the single source for the supported
tools list. Loading the mapped rows as Spoolman would instead overwrite a real Spoolman inventory
in the same slot. So the mapper produces a Spoolman-format CSV to download; the person drops that
file on the page, where it goes through the normal Spoolman file importer, request revisions,
persistence and the usual import report. The output uses Spoolman's own export columns
(`filament.vendor.name`, `filament.color_hex`, ...) with generated numeric spool, filament and vendor
ids (the same filament and vendor share one id), text cells that a spreadsheet would run as a
formula carry Spoolman's leading apostrophe, and `used_weight` is folded into `remaining_weight`
because the importer rejects an empty `used_weight` cell.

Modules (`src/lib/import-mapper/`): `fields.ts` (field list, header aliases, `suggestMapping`,
`headerSignature`, `validateMapping`; no parser, so it is safe on every page), `store.ts`
(`spoolsync:column-maps`, mappings per header signature, capped at 20, sanitised on read), `convert.ts`
(`parseSourceTable`, `parseLooseNumber`, `parseHexColor`, `convertToSpoolmanCsv`; the only module
that imports papaparse, loaded on demand), and `report.ts`. A column layout is recognised again by
`headerSignature` (sorted, lower-cased, de-duplicated headers hashed with FNV-1a), whatever the
column order. A mapping is valid when every mapped header exists, no header feeds two fields (the UI
also moves a field when another column takes it), and brand, material or name is mapped. A bad
mapping cannot produce a file: `convertToSpoolmanCsv` throws and the download stays disabled.

**Dry run.** After every change the converted CSV is read back with the real `loadSpoolmanFile`, and
`mapperImportReport` merges the converter's skipped rows and adjusted values with the importer's
warnings into one `ImportReport`, translating the importer's `Spool N` back to the row of the original
file. The dialog shows it with `renderImportReport` (the existing report view, now split out of
`importReportView`) under "Dry run": no state, storage or service is touched. "Remember this mapping"
(default on) saves the mapping and unit for that layout; unticking forgets it. "Row N" means the Nth
data row (or JSON record), not the sheet row.

Limits: 20 MB (as smart-drop), 50,000 rows, 200 columns; JSON is flattened to dotted columns three
levels deep. A prototype-less row object keeps headers such as `__proto__` harmless. Conversion
reasons are English, like every importer warning.

## Internationalisation

`lib/i18n/` is a small typed message catalogue with no dependency. `en.ts` is the source of truth;
`MessageKey` is its key type and every other catalogue is typed `Record<MessageKey, string>`, so a
missing or extra key fails the type check, and `i18n.test.ts` also asserts that each catalogue has
exactly English's keys, that every message parses, and that each translation uses the same
placeholders as English. At runtime lookup is per key: a key missing from a translation, or a
malformed translation, falls back to English instead of showing a blank.

Messages use ICU-lite (`format.ts`): `{name}` and `{count, plural, one {# spool} other {# spools}}`
with `=N` exact matches and a required `other`, selected with `Intl.PluralRules` for the locale.
Numbers go through a cached `Intl.NumberFormat`; `formatNumber` and `formatDate` give locale
conventions for the rest, and `lib/units.ts` (`formatWeight`, `formatMoney`) now formats with the
page language too. Braces are reserved (no literal braces in a message). Locales are `en`, `de`,
`es`, `fr`, `nl`; `setLocale` stores the choice (`spoolsync:language`, English stores nothing), sets
`<html lang>`, and fires `spoolsync:locale-changed` so open panels redraw. The language selector sits
next to the weight unit in the Saved settings dialog, with each language named in itself.
`wireSavedData` (run by the shared layout on every page) applies the stored language and syncs other
tabs, so no layout file changed.

Migrated so far: the progress steps, the setup guide, the command palette (chrome and action
titles), the spool drawer's section headings, the data health dashboard, the table tools, the column
mapper, and the display settings. Everything else, including the static Astro page text, source
guides and importer warnings, stays English. `<html lang>` follows the chosen language, so on a
non-English setting the not-yet-translated static text is announced by screen readers with the wrong
language until the pages are migrated; this is the main known gap. Add strings in `en.ts` first, then
every catalogue; `t()` never needs a call-site change for a new language beyond registering it in
`LOCALES`, `LOCALE_NAMES` and `CATALOGUES`.

**The German, Spanish, French and Dutch catalogues are machine-assisted drafts and need review by
native speakers** (including terminology such as "spool", "inventory" and the gender and formality
choices) before the languages are promoted in the UI or the README.

New CSS for these features (`styles/health.css`) uses logical properties only (`inline-size`,
`margin-block`, `padding-inline`, `inset-inline-start`) so right-to-left languages can be added later.

## Inventory table tools

The loaded-spools table gained three things, all in the browser and none changing a loaded inventory.

- **Column chooser.** `lib/table-columns.ts` lists the nine columns; the choice is stored as
  `spoolsync:table-columns` (cleared when every column shows), sanitised on read, always includes the
  name column because it opens the spool drawer, and is portable in backups. The chooser is a
  `details` menu with real checkboxes (Escape and an outside click close it).
- **Export of the current view.** `lib/table-export.ts` and `scripts/load/table-tools.ts` download
  exactly the spools in `visibleSpools()` (after search, chips, ranges, grouping and sort, in table
  order) as CSV (core's combined-inventory writer, so formula cells are neutralised and weights are
  grams) or as `spoolsync-view` JSON. A palette action runs the CSV export.
- **Row windowing.** Rows are built 200 at a time (`lib/table-window.ts`): sorting, filtering and
  grouping still use the whole list, and only the DOM is windowed, so a 5,000-spool inventory no
  longer builds thousands of rows with listeners at once. "Show 200 more" and "Show all" add rows,
  move focus to the first added row, and announce "Showing 400 of 5,000 spools" in a status region.
  The window resets when the search, filters, sort or grouping change. Label printing, saved views
  and exports use the full list. The "loaded summary" line is now `aria-live`, so filter changes
  announce the new count.
