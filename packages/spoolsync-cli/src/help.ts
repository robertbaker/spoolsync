import { CLEANUP_RULE_IDS } from "@spoolsync/core/core/cleanup";
import { COMPARABLE_FIELDS, SOURCE_IDS } from "@spoolsync/core/core/model";
import {
  canWrite,
  canWriteViaApi,
  formatPhrase,
  listServices,
} from "@spoolsync/core/core/services";

import { formatHelp } from "./presentation";

export function help(): void {
  console.log(helpText(process.stdout.isTTY ? process.stdout.columns : 80));
}

export function helpText(columns = 80): string {
  const services = listServices(SOURCE_IDS);
  const apiServices = services.filter(
    ({ info }) => info.cliApiFlag && info.apiClients.includes("cli"),
  );
  const writableApis = apiServices.filter(({ id }) => canWriteViaApi(id));
  return formatHelp(
    `SpoolSync CLI — compare inventory exports and write updates to supported services.

Usage:
  spoolsync [options]

Quick start:
  Inspect one inventory:
    spoolsync --spoolman inventory.json --summary
  Preview a comparison without writing:
    spoolsync --spoolman inventory.json --spoolio backup.json
  Save updated import files:
    spoolsync --spoolman inventory.json --spoolio backup.json --output-dir ./updated

  Start with a preview, review conflicts and possible matches, then choose where to write.
  No remote service is modified unless --apply is set.

File inputs (two inventories for comparison; one for reports or CSV export):
${services.map(({ id, info }) => `  ${info.cliFlag} <file>  ${info.name} ${formatPhrase(info.readFormats)} export${canWrite(id) ? "" : " (read-only source)"}${info.cliAliases?.length ? `; aliases: ${info.cliAliases.join(", ")}` : ""}`).join("\n")}
  --empty <sources>      Start empty writable inventories (comma-separated; repeatable)

Direct API inputs:
${apiServices.map(({ info }) => `  ${info.cliApiFlag} <url>  Load ${info.name} directly instead of from a file`).join("\n")}

API credentials:
  --spoolman-token <token> API token (or set SPOOLMAN_TOKEN)
  --filamentdb-token <token> Session token for installs with user management (or set FILAMENTDB_TOKEN)
  --filament-db-token <key> API key if the server sets one (or set FILAMENT_DB_API_KEY, else FILAMENTDB_API_KEY)
  --bambuddy-token <key>  Bambuddy API key (or set BAMBUDDY_API_KEY); --apply needs the Manage inventory scope
  --printstudio-operator <id> PrintStudio trusted operator id (or set PRINTSTUDIO_OPERATOR_ID); --apply creates and edits only local lots
  --filadex-user <name>   Filadex username; the password comes from FILADEX_PASSWORD

Planning:
  --resolve <field=source> Resolve a conflicting field from the named source; repeatable
                          Choose one source per field (see valid names below)
  --confirm <pair>        Confirm a suggested pair (source:id,source:id); repeatable
  --reject <pair>         Reject a suggested pair (source:id,source:id); repeatable
  --create-in <sources>   Create missing spools in loaded writable sources (not read-only sources)

Files and automation:
  --output-dir <dir>      Write updated import files for loaded file sources (not read-only sources)
  --completion <shell>    Print a shell completion script (bash, zsh, or fish)
  --watch                 Run again whenever an input file changes (not with --apply or --*-url)
  --quiet                 With --watch, print a run only when its output differs from the last
                          Each --watch run after the first also lists what changed since the previous run

Saved settings:
  --config <file>         Read default options from a JSON file (command-line options replace them)
  --save-config           Save the given options (and inventory paths) as defaults in your settings file
  --no-user-config        Ignore the settings file for this run
  --export-settings <file> Write your saved settings to a file (the browser can import it too)
  --import-settings <file> Replace your saved settings with ones exported from the CLI or the browser
  --show-config           Show what the settings file, --config, and the command line each supply
  --config-path           Print where the settings file lives
  --clear-config          Delete the settings file

Reports and data quality:
  --summary               Print counts for each loaded inventory instead of planning changes
  --reorder               Print a shopping list of spools that are running low
  --low-threshold <pct>   With --summary or --reorder, the percent of full weight at or under which a spool is low (default 20)
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

Remote writes and recovery:
  --rollback-dir <dir>    Where --apply saves the rollback file it makes before writing (default: a rollbacks folder beside the settings file)
  --no-rollback           With --apply, write without saving a rollback file first
  --restore-rollback <file> Put back the values a rollback file recorded in the service named by ${writableApis.map(({ info }) => info.cliApiFlag).join(", ")};
                          fields changed since are left alone, and nothing is written without --apply
  --apply                 Apply planned changes to directly loaded ${writableApis.map(({ info }) => info.name).join(", ")} inventories

Display:
  --format <text|json>    Output format; json prints one versioned report on stdout (see schema/report.schema.json)
  --json                  Same as --format json
  -V, --version           Show the installed CLI version (supports --json)
  -h, --help              Show this help

Resolution fields:
  ${COMPARABLE_FIELDS.join(", ")}

Source names:
  ${SOURCE_IDS.join(", ")}

Options with values also accept --option=value.
Without --output-dir, no updated inventory files are written. --export-csv writes a combined CSV independently. No remote service is modified unless --apply is set.`,
    columns,
  );
}
