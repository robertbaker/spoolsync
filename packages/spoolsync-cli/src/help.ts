import { CLEANUP_RULE_IDS } from "@spoolsync/core/core/cleanup";
import { COMPARABLE_FIELDS, SOURCE_IDS } from "@spoolsync/core/core/model";

export function help(): void {
  console.log(`SpoolSync CLI — compare inventory exports and write updates to supported services.

Usage:
  spoolsync [options]

Inputs (provide at least two):
  --spoolman <file>       Spoolman JSON or CSV export
  --spoolstock <file>     Spoolstock CSV export (read-only source)
  --spoolio <file>        Spoolio JSON export
  --tigertag <file>       TigerTag .ttag or JSON export
  --three-dfp <file>      3DFilamentProfiles CSV or JSON export
  --bambuddy <file>       Bambuddy inventory CSV or API response JSON
  --filameter <file>      FilaMeter backup JSON or CSV export
  --filadex <file>        Filadex JSON or CSV export
  --filamentdb <file>     FilamentDB ZIP export or spools JSON
  --filament-db <file>    Filament DB snapshot JSON (read-only source)
  --spoolmaster <file>    SpoolMaster Excel (.xlsx) export (read-only source)
  --spoolhoarder <file>   Spool Hoarder inventory or HueForge CSV (read-only source)
  --spool <file>          Spool app JSON backup (read-only source)
  --spoolkeep <file>      SpoolKeep JSON backup (read-only source)
  --empty <sources>      Start empty writable inventories (comma-separated; repeatable)
  --spoolman-url <url>    Load Spoolman directly instead of from a file
  --spoolman-token <token> API token (or set SPOOLMAN_TOKEN)
  --filamentdb-url <url>  Load FilamentDB directly instead of from a file
  --filamentdb-token <token> Session token for installs with user management (or set FILAMENTDB_TOKEN)
  --filament-db-url <url> Read Filament DB directly instead of from a file (never written)
  --filament-db-token <key> API key if the server sets FILAMENTDB_API_KEY (or set FILAMENT_DB_API_KEY)
  --bambuddy-url <url>    Load Bambuddy directly instead of from a file
  --bambuddy-token <key>  Bambuddy API key (or set BAMBUDDY_API_KEY); --apply needs the Manage inventory scope
  --filadex-url <url>     Load Filadex directly instead of from a file
  --filadex-user <name>   Filadex username; the password comes from FILADEX_PASSWORD

Planning:
  --resolve <field=source> Resolve a conflicting field from the named source; repeatable
                          Choose one source per field (see valid names below)
  --confirm <pair>        Confirm a suggested pair (source:id,source:id); repeatable
  --reject <pair>         Reject a suggested pair (source:id,source:id); repeatable
  --create-in <sources>   Create missing spools in loaded writable sources (not read-only sources)

Output:
  --output-dir <dir>      Write updated import files for loaded file sources (not read-only sources)
  --config <file>         Read default options from a JSON file (command-line options replace them)
  --completion <shell>    Print a shell completion script (bash, zsh, or fish)
  --watch                 Run again whenever an input file changes (not with --apply or --*-url)
  --quiet                 With --watch, print a run only when its output differs from the last
                          Each --watch run after the first also lists what changed since the previous run
  --low-threshold <pct>   With --summary or --reorder, the percent of full weight at or under which a spool is low (default 20)
  --reorder               Print a shopping list of spools that are running low
  --save-config           Save the given options (and inventory paths) as defaults in your settings file
  --no-user-config        Ignore the settings file for this run
  --export-settings <file> Write your saved settings to a file (the browser can import it too)
  --import-settings <file> Replace your saved settings with ones exported from the CLI or the browser
  --show-config           Show what the settings file, --config, and the command line each supply
  --config-path           Print where the settings file lives
  --clear-config          Delete the settings file
  --summary               Print counts for each loaded inventory instead of planning changes
  --cleanup[=<rules>]     Apply safe data cleanups (whitespace, casing, color codes, number formats) to the plan
                          before comparing; changes that need a person to look are listed, not applied.
                          <rules> is a comma list of: ${CLEANUP_RULE_IDS.join(", ")} (or all, -rule to leave one out)
  --cleanup-report[=<rules>] List every proposed cleanup and warning (alone it plans nothing and works with one inventory)
  --reference <file>      Match spools to a reference file (JSON or CSV of filaments, or a snapshot downloaded from the site) and add the missing values it can fill,
                          from confident, unambiguous matches only, to the plan; overwrites and unclear matches are listed, not applied
  --reference-report <file> List every reference match, difference, ambiguous choice and color check (alone it plans nothing and works with one inventory)
  --fail-on-mismatch      With --reference or --reference-report, exit with code 1 when a spool's value or color differs from the reference
                          (for a scheduled check; fills for empty fields do not count)
  --export-csv <file>     Write every loaded spool to one CSV file (works with a single inventory)
  --rollback-dir <dir>    Where --apply saves the rollback file it makes before writing (default: a rollbacks folder beside the settings file)
  --no-rollback           With --apply, write without saving a rollback file first
  --restore-rollback <file> Put back the values a rollback file recorded in the service named by --spoolman-url, --filamentdb-url, --bambuddy-url, or --filadex-url;
                          fields changed since are left alone, and nothing is written without --apply
  --apply                 Apply planned changes to directly loaded Spoolman, FilamentDB, Bambuddy, or Filadex inventories
  --format <text|json>    Output format; json prints one versioned report on stdout (see schema/report.schema.json)
  --json                  Same as --format json
  -V, --version           Show the installed CLI version (supports --json)
  -h, --help              Show this help

Resolution fields:
  ${COMPARABLE_FIELDS.join(", ")}

Source names:
  ${SOURCE_IDS.join(", ")}

Options with values also accept --option=value.
Without --output-dir, no export files are written. No remote service is modified unless --apply is set.`);
}
