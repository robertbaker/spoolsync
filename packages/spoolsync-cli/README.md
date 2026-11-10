# SpoolSync CLI

Compare and sync filament inventories from your terminal. `spoolsync` uses the same matching,
planning, and export adapters as the [SpoolSync web app](https://spoolsync.com), and works across
<!-- services:cli-names-inline:start -->Spoolman, Spoolstock, Spoolio, TigerTag, 3DFilamentProfiles, Bambuddy, FilaMeter, Filadex, FilamentDB, Filament DB, SpoolMaster, Spool Hoarder, Spool, and SpoolKeep<!-- services:cli-names-inline:end -->.

> <!-- services:readonly-inline:start -->Spoolstock, SpoolMaster, Spool Hoarder, Spool, and SpoolKeep are read-only sources: SpoolSync reads their exports and uses their values to update other services, but they do not accept imports.<!-- services:readonly-inline:end --> For a walkthrough of the browser
>
> app's Load, Review, and Apply flow, open [spoolsync.com](https://spoolsync.com) and select **Take a tour**.

Each service has its own input option:

<!-- services:cli-inputs:start -->
| Service                          | File option      | API option          | Reads files |
| -------------------------------- | ---------------- | ------------------- | ----------- |
| Spoolman / Spoolman-NG           | `--spoolman`     | `--spoolman-url`    | JSON, CSV   |
| Spoolstock                       | `--spoolstock`   | None                | CSV         |
| Spoolio                          | `--spoolio`      | None                | JSON        |
| TigerTag                         | `--tigertag`     | None                | .ttag, JSON |
| 3DFilamentProfiles               | `--three-dfp`    | None                | CSV, JSON   |
| Bambuddy                         | `--bambuddy`     | `--bambuddy-url`    | CSV, JSON   |
| FilaMeter                        | `--filameter`    | None                | JSON, CSV   |
| Filadex                          | `--filadex`      | `--filadex-url`     | JSON, CSV   |
| FilamentDB                       | `--filamentdb`   | `--filamentdb-url`  | ZIP, JSON   |
| Filament DB (hyiger/filament-db) | `--filament-db`  | `--filament-db-url` | JSON, CSV   |
| SpoolMaster                      | `--spoolmaster`  | None                | Excel       |
| Spool Hoarder                    | `--spoolhoarder` | None                | CSV         |
| Spool (Mac and iOS app)          | `--spool`        | None                | JSON        |
| SpoolKeep                        | `--spoolkeep`    | None                | JSON        |
<!-- services:cli-inputs:end -->

## Install

```sh
npm install --global spoolsync
spoolsync --help
spoolsync --version
```

Requires Node.js 22 or later. Use `spoolsync --version --json` to read the installed version in scripts.

## Quick start

Provide at least two inventories (targets started with `--empty` count). Run a plan without writing
anything:

```sh
spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json
```

Resolve conflicting values, create missing records in a target, and write updated files:

```sh
spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json \
  --resolve material=spoolstock --create-in spoolio --output-dir ./updated
```

Start a new target inventory without a starter file:

```sh
spoolsync --spoolio spoolio.json --empty filameter --create-in filameter --output-dir ./updated
```

Check what an export holds without planning anything (including how many spools are running low: at or under a fifth of their full weight); this works with a single inventory and adds
`--json` output for scripts:

```sh
spoolsync --spoolkeep SpoolKeep.json --summary
```

Print a shopping list of spools that are running low (at or under a fifth of their full weight by
default, or `--low-threshold <percent>`; each physical spool listed once). It works with a single inventory and supports `--json`:

```sh
spoolsync --spoolio spoolio.json --spoolkeep SpoolKeep.json --reorder
```

Export every loaded spool to one spreadsheet-friendly CSV, tagged by service. This also works with a
single inventory, and it refuses to overwrite one of your input files:

```sh
spoolsync --spoolmaster SpoolMaster.xlsx --spoolkeep SpoolKeep.json --export-csv ./inventory.csv
```

Remember your setup. `--save-config` writes the options you give (and your inventory file paths, as
absolute paths, and `--format json` when you use it) to a settings file in your user profile, so a bare `spoolsync --summary` works next
time:

```sh
spoolsync --spoolio ~/inv/spoolio.json --spoolkeep ~/inv/SpoolKeep.json --output-dir ~/inv/updated --save-config
spoolsync --summary          # uses the saved inventories
```

- **Where:** `~/.config/spoolsync/config.json` (or `$XDG_CONFIG_HOME/spoolsync/`), `%APPDATA%\spoolsync\`
  on Windows, or `$SPOOLSYNC_CONFIG_DIR`. `spoolsync --config-path` prints the exact location.
- **Order of precedence:** the command line, then `--config <file>`, then the settings file. An option
  from a stronger layer replaces the same option from a weaker one.
- **Saved inventories never join a comparison you spelled out:** they are used only when the command
  line and `--config` name no inventory at all, and a note on stderr says so.
- **Never saved:** tokens and passwords, `--apply`, `--watch`, and per-run choices such as
  `--confirm`. The file is written atomically and readable only by you. A service address that
  carries a credential (user name and password, or a query parameter such as `token`, `key`, `secret`,
  `password` or `auth`) is not saved, and `--save-config` stops with an error naming the option.
- `--no-user-config` ignores the file for one run, and `--clear-config` deletes it.
- **Share settings:** `--export-settings <file>` writes your saved settings to a file and
  `--import-settings <file>` replaces them from one. The file uses the same format as the browser's
  **Saved settings → Export settings**, so the two can exchange what they share (the low-stock
  threshold); the CLI's own settings ride along in a `cli` section the browser ignores. Imports go
  through the same checks as a config file, so a secret or unknown key is refused.
- `--show-config` prints what the settings file, `--config`, and the command line each contribute, to
  see why an option has the value it has.

Keep your usual options in a config file. Keys are the long option names without dashes, paths are
relative to the file, and command-line options replace the same option from the file:

```json
{
  "spoolio": "./spoolio.json",
  "spoolkeep": "./SpoolKeep.json",
  "create-in": ["spoolio"],
  "output-dir": "./updated"
}
```

```sh
spoolsync --config spoolsync.json
```

Tokens and passwords are rejected in config files (they tend to be committed); use the
`SPOOLMAN_TOKEN`, `FILAMENTDB_TOKEN`, and `FILADEX_PASSWORD` environment variables. For the same
reason a service URL with credentials in it (`http://user:pass@host`, or `?token=...`, `?api_key=...`
and similar) is rejected, on the command line too. `"apply"` is rejected in any config, saved-settings
or imported-settings file: writing to a service is turned on only by `--apply` on the command line.

Keep a plan up to date while you edit an export. `--watch` re-runs whenever an input file changes,
reports errors (a run that fails is printed as "Watch run failed" and the exit code becomes 1) and keeps going, and stops on Ctrl+C (or when you type `q` and press Enter, which
also works where a signal cannot be sent, such as a Windows process started by another program). It only watches files, and it refuses `--apply`
so a service is never written on every save:

```sh
spoolsync --spoolio spoolio.json --spoolkeep SpoolKeep.json --watch
```

Add `--quiet` to `--watch` to print a run only when its output differs from the previous one, so a
terminal left open stays readable while you keep saving:

```sh
spoolsync --spoolio spoolio.json --spoolkeep SpoolKeep.json --watch --quiet
```

With `--watch`, every run after the first also lists what changed since the previous successful run:
spools added or removed, remaining-weight changes, and new possible matches. In JSON this is a
`changesSinceLastRun` object. It is left out when nothing changed, so runs that print the same thing
stay hidden with `--quiet`.

```text
Changes since the last run:
  + added spoolio:c (C ABS)
  - removed spoolio:b (B PETG)
  ~ spoolio:a (A PLA): 500 g -> 450 g remaining
  ? new possible match spoolio:a,spoolman:3
```

Enable tab completion for options, source names, and fields:

```sh
source <(spoolsync --completion bash)          # bash
spoolsync --completion fish | source           # fish
spoolsync --completion zsh > ~/.zfunc/_spoolsync   # zsh, with ~/.zfunc on your fpath
```

## Options

- **Equals syntax:** options with values also accept `--spoolman=spoolman.json` or
  `--resolve=material=spoolstock`. Use it when a filename, directory, or token starts with a dash,
  such as `--spoolio=-inventory.json` or `--output-dir=-updated`.
- **Single-use options:** connection options, `--output-dir`, `--export-csv`, and `--config` may only be supplied once;
  `--spoolman-token` requires `--spoolman-url`.
- **`--resolve`:** choose one source per field; conflicting repeated resolutions are rejected.
  Run `spoolsync --help` for valid fields and source names.
- **`--empty`:** accepts comma-separated writable source names and can be repeated. Pair it with
  `--create-in` to copy missing spools into those targets. Empty inventories take part in dry runs
  and file exports, but cannot also be loaded from a file or API in the same run.
- **`--format <text|json>`:** `json` prints one report on stdout (warnings and progress stay on
  stderr); `--json` is the same thing. Reports are versioned and described by
  [`schema/report.schema.json`](schema/report.schema.json), also importable as
  `spoolsync/report.schema.json`. See [JSON reports](#json-reports).
- **`--cleanup[=rules]` and `--cleanup-report[=rules]`:** data cleanup, described in
  [Data cleanup](#data-cleanup). `--cleanup` needs two inventories; `--cleanup-report` also works
  with one.
- **`--reference <file>` and `--reference-report <file>`:** reference data, described in
  [Reference data](#reference-data). `--reference` needs two inventories; `--reference-report` also
  works with one.
- **Helpful errors:** a misspelled option suggests the closest real one, a missing input file says so,
  and a file passed to the wrong service flag names the service it looks like (for example
  `--spoolio` given a SpoolKeep backup suggests `--spoolkeep`).
- **Windows:** output names that Windows treats specially (`NUL`, `COM1`, `name:stream`, trailing
  dots) are refused, and differently cased spellings of an input are recognised as the same file.

## Data cleanup

SpoolSync can propose tidier values for what you loaded: extra or invisible whitespace, ALL CAPS
or all-lowercase names, brand spellings (`Prusament Inc` to `Prusament`), materials (`pla plus` to
`PLA+`, `Nylon` to `PA`), diameters (`1,75`), color codes (`#f00` to `FF0000`), prices written with
symbols (`€ 1.299,00`), weights with units, temperatures, barcodes, and purchase dates. Each
proposal names the rule that made it and is either **safe** (only form changes) or **review**
(an alias, a unit conversion, or a value moved between fields).

```sh
spoolsync --spoolman spoolman.json --spoolio spoolio.json --cleanup --output-dir updated
spoolsync --spoolio spoolio.json --cleanup-report            # one inventory, nothing planned
spoolsync --spoolman a.json --spoolio b.json --cleanup=whitespace,casing
spoolsync --spoolman a.json --spoolio b.json --cleanup=all,-vendor-alias
```

- **`--cleanup[=rules]`** adds the **safe** proposals to the plan as updates to the record they came
  from, so they appear in `plannedChanges`, in written files, and with `--apply`. Review proposals
  are never applied; they are counted and, with `--cleanup-report`, listed. A change is planned only
  where the service is writable and stores the field. Matching still uses the values as loaded.
- **`--cleanup-report[=rules]`** prints every proposal (with its rule, confidence and reason) and
  every warning. On its own it plans and writes nothing and works with a single inventory; it
  cannot be combined with `--summary`, `--reorder`, or options that change something.
- **Rules** are `whitespace`, `casing`, `vendor-alias`, `material`, `material-variant`,
  `diameter`, `color-hex`, `price`, `weight`, `temperature`, `barcode`, and `date`. Name some
  (`--cleanup=casing,whitespace`), say `all`, or leave one out (`all,-casing` or `-casing`). With
  no list, every rule runs. Both options accept a list only after `=`.
- **Warnings** (negative or zero prices, a remaining weight above the full weight, a net weight
  that looks like kilograms, diameters that are not 1.75/2.85/3, temperatures out of range,
  barcodes mangled by a spreadsheet) are reported but never changed. Warnings print to stderr.
- A **possible duplicates after cleanup** line names spools in one service that would look like
  duplicates once the safe changes are applied. Nothing is merged.
- In `--config` or the settings file, `"cleanup": true` (or text such as `"casing,whitespace"`) and
  `"cleanup-report"` work like the options. `--save-config` does not save them. Rules named on the
  command line replace rules named in `--config`, which replace those in the settings file.
- JSON reports gain a `cleanup` object: `rules`, `counts`, `applied` (changes added to the plan),
  `proposals` (with `--cleanup-report`), `warnings`, and `duplicatesAfterCleanup`. With
  `--cleanup-report` alone the report is `"inventory"` with a `cleanup` object.

## Reference data

Match your spools to a reference catalog (a JSON or CSV file of filaments, such as an export from a
public filament database) to fill in what is missing and to check colors. The CLI reads only the
file you give it and never contacts a reference service. The web app publishes ready-made files of
the Open Filament Database and FilamentColors (`/reference/openfilamentdatabase.json` and
`/reference/filamentcolors.json`, rebuilt with each deploy); download one and pass it as
`--reference` and the CLI reads it directly. The in-browser fetching and update checks are a browser
feature (see `docs/architecture.md`).

```sh
spoolsync --spoolman spoolman.json --spoolio spoolio.json --reference filaments.json --output-dir updated
spoolsync --spoolio spoolio.json --reference-report filaments.json     # one inventory, nothing planned
```

- **File format:** a JSON list of records (or an object holding one list, optionally with
  `attribution` and `license` text), or CSV with a header row. Names are matched ignoring case and
  punctuation: `brand` (also `vendor`, `manufacturer`), `material`, `color_name`, `hex`,
  `diameter`, `density`, `nozzle_temp_min`/`nozzle_temp_max` (or a range such as `nozzle_temp`
  `190-220`), `bed_temp_min`/`bed_temp_max`, `net_weight`, `spool_weight` (empty spool), `price`,
  `barcode` (also `ean`, `upc`, `gtin`), and `url`. Weights of 10 or less are read as kilograms.
- **Matching** compares the brand (using the same brand aliases as cleanup), material, name, color,
  diameter and barcode, and scores each candidate. A spool is matched only when one record is
  clearly ahead; when several fit about equally, or the match is only partial, the spool is
  reported and left alone. The Load page in the browser is where such a choice is made.
- **`--reference <file>`** adds the missing values a **confident, unambiguous** match can fill to the
  plan, as updates to the record they came from, so they appear in `plannedChanges`, in written
  files, and with `--apply`. Existing values are never overwritten, and a change is planned only
  where the service is writable and stores the field. Brand and price are not filled.
- **`--reference-report <file>`** prints every proposal (fills and would-be overwrites, with the
  reference record and a reason), the spools that need a choice, and every color that is not a
  match. On its own it plans and writes nothing and works with a single inventory; it cannot be
  combined with `--summary`, `--reorder`, or options that change something. Color differences use
  CIEDE2000: up to 2.3 is a match, up to 5 is close, above 5 is a mismatch.
- **`--fail-on-mismatch`** (with either option) makes the run exit with code 1 when a spool
  disagrees with the reference: a value that differs from a confident match, or a color that does not
  match. Fills for empty fields do not count, so a scheduled check stays quiet until something drifts.
  The text report ends with `Reference check passed` or `Reference check failed`, and JSON reports
  carry `reference.counts.mismatches`.
- In `--config` or the settings file, `"reference"` and `"reference-report"` are file paths.
  `--save-config` does not save them.
- JSON reports gain a `reference` object: `provider`, `file`, `attribution`, `license`, `catalog`,
  `counts`, `applied` (changes added to the plan), and with `--reference-report` also `proposals`,
  `ambiguous` and `colorChecks`. With `--reference-report` alone the report is `"inventory"` with a
  `reference` object.

## Direct API access

Writes to a live server require the explicit `--apply` option.

### Rollback files

Before `--apply` writes to a service, the CLI saves a rollback file for it: a readable JSON record
of each changed field's earlier value and the value written, plus a line for every spool that was
created (never the whole inventory). It goes to `--rollback-dir <dir>`, or by default to a
`rollbacks` folder beside the settings file (see `--config-path`), readable only by you, named
`spoolsync-rollback-<service>-<time>.json`. The path is printed (stderr in text mode, `rollbackFiles`
in JSON). If the file cannot be saved, nothing is written to that service; `--no-rollback` writes
without one. If a restore fails, the error report still lists the rollback file that was saved.

```bash
spoolsync --restore-rollback spoolsync-rollback-spoolman-2026-11-04T10-00-00-000.json --spoolman-url http://spoolman.local
spoolsync --restore-rollback <file> --spoolman-url http://spoolman.local --apply
```

`--restore-rollback` names the service by its connection option. Without `--apply` it only shows what
would be put back. A field is restored only while it still holds the value SpoolSync wrote, so edits
made since are never overwritten; fields that changed again, spools that are gone and fields already
restored are listed and left alone. Spools the original sync created are listed to delete by hand,
because SpoolSync never deletes spools, and cross-service ids it stamped are not removed. A restore
writes its own rollback file too. With `--format json` it prints a `"rollback"` report.

### Spoolman

Set `SPOOLMAN_TOKEN` or pass `--spoolman-token` for a protected server:

```sh
spoolsync --spoolman-url http://spoolman.local --spoolstock spoolstock.csv --apply
```

Directly loaded Spoolman inventories also support `--resolve material=spoolman` and
`--create-in spoolman`.

### FilamentDB and Filadex

Both can be loaded and written the same way:

- **FilamentDB:** `--filamentdb-url`, plus `--filamentdb-token` or `FILAMENTDB_TOKEN` when user
  management is on.
- **Filadex:** `--filadex-url` and `--filadex-user`, with the password in `FILADEX_PASSWORD`. It
  logs in with a session cookie, so it is available from the CLI only.

```sh
FILADEX_PASSWORD=... spoolsync --filadex-url http://filadex.local:5000 --filadex-user me \
  --filamentdb-url http://filamentdb.local:3000 --apply
```

## Match decisions

Terminal match suggestions include the record pair and matching reasons, ready to use with
`--confirm` or `--reject` on the next run.

- Decisions must reference two different loaded sources and record IDs present in the loaded
  inventories.
- A pair cannot be both confirmed and rejected.
- Record IDs may contain `|` and `,`. In the pair, `|` and `%` inside an ID are written `%7C` and
  `%25`; the suggestions print pairs in that form, so copy them as shown.
- The CLI stops before writing if a confirmation would put two records from the same service in one
  group, or if a rejection conflicts with existing cross-ID links or other confirmations.
- Duplicate native record IDs in file inventories are rejected before matching, so records are never
  merged accidentally.

## Writing output

Updated import files are written only when `--output-dir` is supplied, and only to supported
targets. Spoolman is written only with `--apply`. Read-only sources can provide values but are never
a write target.

<!-- services:cli-writing:start -->
| Inventory source                                                | How it receives changes       |
| --------------------------------------------------------------- | ----------------------------- |
| File inventory                                                  | Output file in `--output-dir` |
| `--empty` target                                                | Output file in `--output-dir` |
| Direct Spoolman, Bambuddy, Filadex, FilamentDB, and Filament DB | `--apply`                     |
| Spoolstock, SpoolMaster, Spool Hoarder, Spool, and SpoolKeep    | Read-only                     |
<!-- services:cli-writing:end -->

`--output-dir` requires a writable file inventory or `--empty` target. A directly loaded Spoolman
inventory and read-only inputs alone do not produce file exports.

### Safety

- All file exports are prepared before any files or remote changes are written.
- Choose an output directory separate from your inputs. The CLI rejects output paths that would
  overwrite an input inventory, including through resolved paths, directory junctions, symbolic
  links, and hard links.
- Exports are staged as complete files first; invalid destinations fail before any remote changes
  are applied.
- Each export replaces its destination by rename, preserving the previous file until the replacement
  is ready. Staging files are removed after success or a handled error.
- A multi-file export is not a transaction: if a later rename fails, the error identifies the files
  already replaced.

## JSON reports

`--format json` (or `--json`) prints one JSON document per run. Every document starts with
`schemaVersion` (currently `1`) and `report`:

- `"compare"` for two or more inventories: `inventories`, `groups`, `suggestions`, `pendingMatches`
  (each `{ pair, answerWith, score, reasons }`, where `answerWith` is the value for `--confirm` or
  `--reject`), `problems`, `unresolved`, `changes`, `plannedChanges`, `applied`, `written`, and
  `exportWarnings`.
- `"inventory"` for `--summary`, `--reorder`, and `--export-csv` with a single inventory:
  `inventories` (summary), `reorder` (emptiest first), `spools`, `csvExport`, and `written`.

Lists have a fixed order (inventories in source order, changes and pending matches by record key),
and nothing in a report is a credential. `schemaVersion` changes only when a field is removed,
renamed, or changes meaning; new optional fields can be added, so ignore fields you do not know. A
`--config` or settings-file `"format": "json"` works too; a command-line `--format text` overrides it.

## Warnings and errors

- Import warnings print to stderr and appear under each inventory in JSON output. Export warnings
  also print to stderr and are returned in the JSON `exportWarnings` array.
- With `--json`, failures return `{ "error": { "message": "..." } }` on stdout and exit with
  status 1, so scripts can parse errors from the same stream as plans.
- For failures during writing, JSON output includes `written` (completed file replacements) and
  `applied` (remote results, when available). A later cleanup error is reported alongside the
  original failure rather than replacing it.
- If remote writes finish but the follow-up inventory refresh fails, the CLI exits with status 1 and
  preserves the apply results. JSON errors include an `applied` array with each attempted change's
  result. Reload the remote inventory before retrying, since successful writes have already taken
  effect. File exports are not committed when this refresh fails.

## License

[AGPL-3.0](LICENSE)
