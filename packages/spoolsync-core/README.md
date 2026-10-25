# Shared inventory sync package

`@spoolsync/core` supplies the inventory model, adapters, matching, and planning used by the
SpoolSync browser app and CLI. It is a private TypeScript workspace package.

Use `loadInventoryFile(source, text)` to read files. It handles UTF-8 byte-order marks, empty
files, and duplicate native IDs before matching. `createEmptyInventory(source)` creates a
file-backed target for any writable service; Spoolstock is a read-only source.

Pass the loaded spools to `matchSpools`. Suggested matches stay separate until confirmed.
Use `ensureResolution` to obtain a group's field choices and creation targets, then call
`planSync(groups, resolutions, suggestions)`. Pending suggestions prevent duplicate creations.
When groups merge, `reconcileResolutions` retains compatible choices from their previous groups
and clears conflicting choices.
Matching processes native ID claims and equal-score suggestions in a stable order, so reordering
the same input inventories does not change automatic links or which tied suggestion is selected.
Conflicting claims are still reported for correction.

Call `exportInventory(source, loaded, changes)` with the target's own load result and planned
changes. The result contains serialized text, counts, warnings, and optional alternate formats.
Inspect warnings on both the primary export and its alternate files. Exporting serializes data;
the caller decides where to write it.
File exports and remote apply functions validate the entire batch's target source and reject
duplicate updates or creations before writing. `validateTargetChanges` is also available for callers
that need to validate a batch separately.

Native IDs from loaded services take precedence when planning links. Conflicting foreign
cross-ID claims are not propagated to new targets. Planned field values are snapshots, so
editing a color array after planning does not change the prepared values.
Zero tare weights stay distinct from unknown tare weights. Spoolio exports also preserve unknown
remaining weights and prices as null instead of converting them to an empty spool or a free spool.
Group keys escape separator characters in native IDs, so unusual IDs cannot collide with the
identity of a group containing multiple records. Fuzzy material matching keeps `PLA+` distinct
from `PLA` while recognizing `PLA Plus` as the same spelling as `PLA+`.

Bambuddy's CSV importer creates spools; it cannot update existing records. Its exporter warns
when planned updates are omitted. TigerTag cloud loading rejects repeated page tokens and duplicate
documents, and concurrent requests share a single token refresh.

Remote apply helpers return the apply log and refreshed inventory. If writes finish but refresh
fails, they throw `ApplyReloadError` with the completed apply log and original error as `cause`.
Retain the log and reload before retrying writes, since successful changes already took effect.

All adapters are available through root namespaces (`spoolman`, `spoolstock`, `spoolio`,
`tigertag`, `threeDfp`, `bambuddy`, `filameter`) or the package's adapter subpaths.

From the repository root:

```sh
bun run check:packages
bun run --filter @spoolsync/core test
bun run test
bun run test:cli
```

The package check covers both workspace packages independently of the browser application's
type check. The CLI integration suite runs against the built JavaScript using Node.
