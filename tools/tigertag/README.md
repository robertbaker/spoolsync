# Spoolman to TigerTag import

This standalone TypeScript CLI reads a Spoolman inventory and writes a `.ttag` file for Tiger Studio
Manager. It does not write to either service. The output is a chipless TigerData entry per spool, and
Studio shows its import preview before adding anything to the signed-in account.

## Run from SpoolSync

```sh
bun run tools/tigertag/spoolman-to-ttag.ts --url http://spoolman.local --output spoolman-inventory.ttag
```

For a protected API, set `SPOOLMAN_TOKEN` or pass `--token`. Keep credentials out of the URL:

```sh
SPOOLMAN_TOKEN='your-token' bun run tools/tigertag/spoolman-to-ttag.ts \
  --url https://spoolman.example.com --output spoolman-inventory.ttag
```

The CLI fetches all spool pages from `GET /api/v1/spool`. Archived spools are excluded by default;
add `--include-archived` to include them.

## From a JSON export

```sh
bun run tools/tigertag/spoolman-to-ttag.ts \
  --input spoolman-export.json --output spoolman-inventory.ttag
```

The input can be the API's spool array or an object with a `spools` array. Spool objects use the
nested `filament` data of Spoolman's API response, or the dotted keys (`filament.name`) of
Spoolman's file export.

The converter carries over vendor, material, filament name, colors (up to three, the most a TigerTag
record holds), diameter, temperature settings, article number, empty spool weight, location, lot
and comment, capacity, and remaining weight (from `remaining_weight`, or capacity minus
`used_weight`) where present. Diameters are limited to 1.75 mm and 2.85 mm. Known
vendor and material IDs use TigerTag's reference data in `packages/spoolsync-core/src/adapters/tigertag/reference-data/`; unknown labels are retained in
the inventory record and use generic reference IDs. The generated file has restrictive local file
permissions. Review the import preview in Tiger Studio Manager before accepting it.
