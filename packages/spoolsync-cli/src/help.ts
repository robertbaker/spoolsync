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
  --filamentdb <file>     FilamentDB spools JSON
  --empty <sources>      Start empty writable inventories (comma-separated; repeatable)
  --spoolman-url <url>    Load Spoolman directly instead of from a file
  --spoolman-token <token> API token (or set SPOOLMAN_TOKEN)
  --filamentdb-url <url>  Load FilamentDB directly instead of from a file
  --filamentdb-token <token> Session token for installs with user management (or set FILAMENTDB_TOKEN)
  --filadex-url <url>     Load Filadex directly instead of from a file
  --filadex-user <name>   Filadex username; the password comes from FILADEX_PASSWORD

Planning:
  --resolve <field=source> Resolve a conflicting field from the named source; repeatable
                          Choose one source per field (see valid names below)
  --confirm <pair>        Confirm a suggested pair (source:id,source:id); repeatable
  --reject <pair>         Reject a suggested pair (source:id,source:id); repeatable
  --create-in <sources>   Create missing spools in loaded writable sources (not spoolstock)

Output:
  --output-dir <dir>      Write updated import files for loaded file sources (not spoolstock)
  --apply                 Apply planned changes to directly loaded Spoolman, FilamentDB, or Filadex inventories
  --json                  Print the plan as JSON
  -V, --version           Show the installed CLI version (supports --json)
  -h, --help              Show this help

Resolution fields:
  ${COMPARABLE_FIELDS.join(", ")}

Source names:
  ${SOURCE_IDS.join(", ")}

Options with values also accept --option=value.
Without --output-dir, no export files are written. No remote service is modified unless --apply is set.`);
}
