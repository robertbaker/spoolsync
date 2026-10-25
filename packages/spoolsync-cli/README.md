# SpoolSync CLI

Compare and sync filament inventories from your terminal. `spoolsync` uses the same matching,
planning, and export adapters as the [SpoolSync web app](https://spoolsync.com), and works across
Spoolman, Spoolstock, Spoolio, TigerTag, 3DFilamentProfiles, Bambuddy, FilaMeter, FilamentDB, and
Filadex.

> Spoolstock CSV exports are read-only inputs. For a walkthrough of the browser app's
> Connect → Load → Sync flow, open [spoolsync.com](https://spoolsync.com) and select **Take a tour**.

## Install

```sh
npm install --global spoolsync
spoolsync --help
spoolsync --version
```

Requires Node.js 20 or later. Use `spoolsync --version --json` to read the installed version in scripts.

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

## Options

- **Equals syntax:** options with values also accept `--spoolman=spoolman.json` or
  `--resolve=material=spoolstock`. Use it when a filename, directory, or token starts with a dash,
  such as `--spoolio=-inventory.json` or `--output-dir=-updated`.
- **Single-use options:** connection options and `--output-dir` may only be supplied once;
  `--spoolman-token` requires `--spoolman-url`.
- **`--resolve`:** choose one source per field; conflicting repeated resolutions are rejected.
  Run `spoolsync --help` for valid fields and source names.
- **`--empty`:** accepts comma-separated writable source names and can be repeated. Pair it with
  `--create-in` to copy missing spools into those targets. Empty inventories take part in dry runs
  and file exports, but cannot also be loaded from a file or API in the same run.
- **`--json`:** machine-readable output.

## Direct API access

Writes to a live server require the explicit `--apply` option.

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
- The CLI stops before writing if a confirmation would put two records from the same service in one
  group, or if a rejection conflicts with existing cross-ID links or other confirmations.
- Duplicate native record IDs in file inventories are rejected before matching, so records are never
  merged accidentally.

## Writing output

Updated import files are written only when `--output-dir` is supplied, and only to supported
targets. Spoolman is written only with `--apply`. Spoolstock can provide values but is never a write
target.

| Inventory source                     | How it receives changes       |
| ------------------------------------ | ----------------------------- |
| File inventory                       | Output file in `--output-dir` |
| `--empty` target                     | Output file in `--output-dir` |
| Direct Spoolman, FilamentDB, Filadex | `--apply`                     |
| Spoolstock                           | Read-only                     |

`--output-dir` requires a writable file inventory or `--empty` target. A directly loaded Spoolman
inventory and read-only Spoolstock input alone do not produce file exports.

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
