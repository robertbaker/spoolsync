# SpoolSync

Compare filament spool inventories across **Spoolman / Spoolman-NG**, **Spoolstock**,
**Spoolio** (spoolio.net), **TigerTag**, **3DFilamentProfiles**, **Bambuddy**, **FilaMeter**, **Filadex**, and **FilamentDB**, then sync changes to the services that accept them. SpoolSync runs entirely in your browser at
<https://www.spoolsync.com>—no server, no account, and no database of its own.

> ☕ **Enjoying SpoolSync?** It's free and open source. [Support development on Ko-fi](https://ko-fi.com/spool_sync).

Spoolstock is a read-only source: SpoolSync can read its CSV exports and use their values to update other services, but Spoolstock does not accept imports.

A sync takes three steps:

1. **Load.** Fetch directly from Spoolman, TigerTag cloud, or Bambuddy, or drop in export files from any supported app.
2. **Sync.** Spools are matched across services by the IDs other tools already stamp on them (such as Spoolman's `spoolstock:spool:<id>` lot number or Spoolio's `spoolmanId`). Similar spools without a shared ID are suggested for you to confirm. Wherever services disagree, you pick the value to keep.
3. **Apply.** Write changes directly to Spoolman or TigerTag cloud, or download updated import files for file-based services.

New to SpoolSync? Click **Take a tour** on any page for a quick walkthrough of connecting, loading, matching, resolving conflicts, and applying updates.

File imports accept UTF-8 byte-order marks and report empty files clearly. An unreadable replacement
file leaves your previously loaded inventory available. Drop one file at a time onto its service card.
CSV imports also accept spreadsheet `sep=` declarations for comma, semicolon, tab, and pipe delimiters.
Exports reject changes for another service, missing update targets, duplicate updates, and duplicate
creations before generating a download. Rebuild the sync plan if an inventory has changed.

Header-only CSV inventories are supported for Bambuddy, FilaMeter, and 3DFilamentProfiles. Empty
CSV downloads include the service's columns and can be loaded again before adding spools on Sync.
Bambuddy also accepts saved JSON inventory API responses, including arrays and empty lists.

CSV downloads report format-specific warnings when backup metadata, document IDs, or structured
extension fields cannot be preserved. Choose JSON for a complete backup. The CLI includes these
warnings in its export report as well.

Spoolman, Spoolio, 3DFilamentProfiles, and FilaMeter downloads are available even without pending
changes. TigerTag downloads require changes; Bambuddy CSV downloads require new spools because
its importer creates entries rather than updating them.

Bambuddy prices are converted between its cost per kilogram and the purchase price per spool
using the initial net weight. If that weight is missing, SpoolSync reports the price as unknown
and warns when a price cannot be exported. Secondary colors are included in Bambuddy CSV downloads.
Empty spool weights can be read from Bambuddy API responses, but its CSV importer ignores
`core_weight`; exports warn when a new spool's empty weight cannot be transferred. FilaMeter CSV
imports keep missing total weights unknown rather than treating those spools as empty.

When creating Bambuddy or FilaMeter spools with incomplete weights, exports preserve a known
remaining amount by using it as the total, or treat a known total as full when remaining weight
is unknown. Both fallbacks produce warnings. Negative weights and remaining weights above the
initial weight must be resolved before export.

| Service                | Read                                            | Write                                               |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Spoolman / Spoolman-NG | API over your local network, or JSON/CSV export | API, or API-shaped JSON download                    |
| Spoolstock             | CSV export (Inventory → export icon)            | Read-only (Spoolstock does not accept imports)      |
| Spoolio (spoolio.net)  | JSON export (Settings → export)                 | JSON download (preserves print logs and settings)   |
| TigerTag               | Cloud sign-in, or `.ttag` / JSON file           | Cloud, or `.ttag` download (changed materials only) |
| 3DFilamentProfiles     | My Spools CSV or JSON export                    | JSON or CSV download                                |
| Bambuddy               | API key over your local network, or CSV export  | CSV download (new spools only to avoid duplicates)  |
| FilaMeter              | Settings JSON backup or filament CSV export     | JSON backup or CSV download                         |
| Filadex                | JSON or CSV export; API login (CLI only)        | JSON or CSV download; API (CLI only)                |
| FilamentDB             | Server API, or `/api/spools` JSON               | API, or JSON list download                          |

## Connecting your Spoolman

Spoolman usually runs on your local network over plain `http://`. To let SpoolSync reach it:

1. Add this to Spoolman's environment (`docker-compose.yml` `environment:` or `.env`), then restart the server:

   ```
   SPOOLMAN_CORS_ORIGIN=https://www.spoolsync.com
   ```

   On Spoolman-NG, also include the Spoolman host in `SPOOLMAN_ALLOWED_HOSTS` if configured, and enter your
   `SPOOLMAN_API_TOKEN` on the Connections page if you use one.

2. Use **Chrome, Edge, or another Chromium browser (version 142+)**. When prompted to let the site
   access devices on your local network, choose **Allow**. Firefox and Safari block `http://` calls
   from an `https://` page; to use them, serve Spoolman over `https://` instead.

The Connections page tests your setup and pinpoints any missing step.
When a CORS block is detected, the alert expands with setup commands for Docker Compose / Portainer, `docker run`,
standalone Linux (`systemd`), and manual/source installs using your exact origin. Note that Docker Compose requires `docker compose up -d` to recreate the container—a plain `restart`
does not apply new environment variables. Keep any `--env-file` and `-f` options your deployment uses.
For standalone Linux installs, update your `.env` file and restart the service
(typically `sudo systemctl restart Spoolman`). See the
[official Spoolman configuration guide](https://github.com/Donkie/Spoolman/wiki/Configuration).

## TigerTag

- **Cloud:** Sign in with your TigerTag email and password on the Connections page. SpoolSync uses
  TigerTag's documented REST endpoints for third-party clients and stores only the session token, never
  your password. Accounts created with Google sign-in need a password set in the TigerTag app first.
- **Files:** Use Export in the inventory toolbar for a `.ttag` file, or Settings → Data → Download JSON. UID-keyed JSON,
  JSON arrays, and empty inventories are all supported—or click **Start empty TigerTag inventory**
  on the Load page. When opening a SpoolSync `.ttag` file in Tiger Studio Manager, select **Restore** (even on a new account):
  **Restore** preserves IDs and remaining weights, whereas **Import** creates duplicate copies at full weight.

## Known limits

- TigerTag's chip format represents only 1.75 mm and 2.85 mm diameters. File exports warn when
  another diameter is converted, or when names or notes exceed the format's text limits.

- FilaMeter and 3DFilamentProfiles exports store one primary color per spool. Exports warn when
  a create or color update contains secondary colors that cannot be represented in those formats.

- Spoolman stores a single extruder and bed temperature rather than a min/max range, so it is excluded from min/max
  temperature comparisons. Newly created Spoolman filaments use the midpoint of the range.
- Not every service stores every field:
  - **Spoolio** does not store density, barcode, location, or archived status.
  - **TigerTag** does not store location, price, purchase date, or archived status.
  - **3DFilamentProfiles** does not store diameter, density, max temperatures, barcode, initial weight, or archived status.
  - **Bambuddy** does not store diameter, density, bed temperatures, barcode, purchase date, or archived status. Its CSV importer only creates new spools and cannot transfer empty spool weights.
  - **FilaMeter** does not store diameter, density, temperatures, barcode, empty spool weight, purchase date, or archived status.
  - **Filadex** does not store density, bed temperatures, empty spool weight, notes, or archived status. It keeps weights in kg plus a remaining percentage, and one color per spool.
  - **FilamentDB** does not store price, location, or purchase date, and keeps one color per spool.
    Unsupported fields for a given service are automatically skipped during comparison.
- TigerTag byte-only records cannot distinguish an absent secondary color from black (`#000000`), though an explicit
  `online_color_list` preserves black secondary colors.
- Spoolio normalizes `PLA-Glow`, `PETG+`, and `PA6-CF` into base material types on import. SpoolSync preserves the exact material name
  in the filament notes and restores it on the next load.
- Spoolstock is export-only and does not accept file imports.

## Development

For setup, verification, and pull request guidance, start with [CONTRIBUTING.md](CONTRIBUTING.md).
The [documentation index](docs/README.md) links to architecture and package-specific guides.

Bun 1.2 or later, Astro 7 (static output), Tailwind 4, and Starwind UI. Starwind components are
vendored in `src/components/starwind/`, so installing dependencies does not require a GitHub token.

```bash
bun install
bun run dev          # http://localhost:4321
bun run check        # Astro and TypeScript checks
bun run check:packages # shared library and CLI TypeScript checks
bun run lint
bun run test         # unit tests
bun run test:cli     # build the CLI and test it under Node
bun run e2e          # Playwright end-to-end tests
# or run all checks with: bun run ci
bun run build
bun run preview      # built site at http://127.0.0.1:4324
bun run deploy       # build and deploy to Cloudflare Workers
```

With local sample exports in `ref/`, run `bun tools/check-ref.ts` to check repeated round trips,
edited fields, alternate CSV files, linked IDs, and matching CSV/JSON exports. This reads the
reference files without changing them and exits unsuccessfully if a supported round trip loses data.

### CLI sync

The public `spoolsync` npm package provides the `spoolsync` command, using the same matching,
planning and supported write adapters as the web app. A run with file inputs is a dry run unless
`--output-dir` is supplied; source files are never changed. Spoolstock CSVs are read-only inputs.
The installed CLI requires Node.js 20 or later. See the [CLI guide](packages/spoolsync-cli/README.md)
for empty targets, match decisions, JSON reports, and partial-write recovery.

```sh
npm install --global spoolsync
spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json
spoolsync --spoolman spoolman.json --spoolstock spoolstock.csv --spoolio spoolio.json \
  --resolve material=spoolstock --create-in spoolio --output-dir ./updated
```

For direct Spoolman access, use `--spoolman-url` and optionally `--spoolman-token` or
`SPOOLMAN_TOKEN`. The CLI only writes to that server when `--apply` is explicitly supplied. See
`spoolsync --help` for all options. Spoolstock can provide values, but cannot be a `--create-in`
target and does not receive an output file. During development, use `bun run spoolsync:sync -- --help`.

CLI releases use release-it: `bun run spoolsync:release`. This updates the package version and
changelog, creates a package-prefixed GitHub release, and publishes to npm. It requires GitHub and
npm release credentials and a clean working tree; running the CLI or its build does not release it.

- `packages/spoolsync-core`: the `@spoolsync/core` workspace library, with the common spool model,
  matching, sync planning, inventory import/export workflows, and API adapters for each service.
- `src/lib/browser`: browser-only session and preference storage.
- `src/scripts/*`: the client scripts behind the Connections, Load and Sync pages.
- `packages/spoolsync-cli`: public npm CLI package, built from the shared sync library.
- `tools/tigertag/spoolman-to-ttag.ts`: standalone converter that turns a Spoolman inventory into a `.ttag`.
- `docs/architecture.md`: current code organization and inventory lifecycle.

Deployed as static assets on Workers (`wrangler.jsonc`) at `www.spoolsync.com`.

## Support the project

SpoolSync is free and maintained in spare time. If it saves you effort, you can
[donate on Ko-fi](https://ko-fi.com/spool_sync). Found a problem?
[Report an issue](https://github.com/robertbaker/spoolsync/issues/new).

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and pull request guidance. SpoolSync
is open source under the GNU AGPL version 3; see [LICENSE](LICENSE) for the full terms. The
Starwind components include MIT-licensed code; see
[src/components/starwind/UPSTREAM.md](src/components/starwind/UPSTREAM.md).

## Trademarks

SpoolSync is an independent project and is not affiliated with, endorsed by, or sponsored by any of
the services it works with. Spoolman, Spoolstock, Spoolio, TigerTag, 3DFilamentProfiles, Bambuddy,
FilaMeter, Filadex, FilamentDB and Bambu Lab are trademarks or property of their respective owners.
Their names and logos appear only to identify compatibility.
