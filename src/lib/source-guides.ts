import type { SourceId } from "@spoolsync/core/core/model";

/**
 * What each service is called in the file picker and where its export comes from. The Load page
 * panels and the first-run setup guide both read this, so the instructions live in one place.
 */
export interface SourceGuide {
  /** The kind of file the service exports, shown beside its name. */
  kind: string;
  /** Where to find the export, in a sentence or two. */
  how: string;
}

export const SOURCE_GUIDES = {
  spoolman: {
    kind: "API, JSON or CSV",
    how: "Export from Spoolman (Settings → Export, JSON or CSV), or save the API export from /api/v1/export/spools?fmt=json, then choose or drop the file here. You can also fetch spools directly with your server address.",
  },
  spoolstock: {
    kind: "CSV",
    how: "Spoolstock is export-only. In the app, open Inventory and tap the CSV export icon, then choose or drop the file here. SpoolSync compares its values against other services, though Spoolstock itself does not accept imports.",
  },
  spoolio: {
    kind: "JSON",
    how: "On spoolio.net, open Settings and export your data, then choose or drop the JSON file here.",
  },
  tigertag: {
    kind: ".ttag or JSON",
    how: "Use Export in Tiger Studio Manager's inventory toolbar for a .ttag file, or Settings → Data → Download JSON. When importing the updated file back into Studio, choose Restore to preserve remaining weights.",
  },
  threeDfp: {
    kind: "CSV or JSON",
    how: "Export your My Spools list as CSV or JSON from 3DFilamentProfiles, then choose or drop the file here.",
  },
  bambuddy: {
    kind: "CSV or JSON",
    how: "Fetch directly with your Bambuddy API key, load a saved inventory API response as JSON, or export an inventory CSV. Bambuddy's CSV importer only adds new entries, so review the download before importing.",
  },
  filameter: {
    kind: "JSON or CSV",
    how: "Open Settings → Import/Export to download a JSON backup or export your filament CSV, then choose or drop it here.",
  },
  filadex: {
    kind: "JSON or CSV",
    how: "Download JSON or CSV from Filadex's export menu (or GET /api/filaments?export=json), then choose or drop the file here.",
  },
  filamentdb: {
    kind: "JSON",
    how: "Save the response of GET /api/spools from FilamentDB, or a single spool file from its data/spools folder. Extract ZIP exports first, or fetch directly from your server. With user management on, POST your username and password to /api/auth/login and paste the returned token.",
  },
  spoolmaster: {
    kind: "Excel (.xlsx)",
    how: "SpoolMaster (Mac and iOS) is export-only here. Export your stock as an Excel workbook, then choose or drop the .xlsx file. The Stock sheet is read; the Shopping List sheet is ignored. SpoolMaster does not accept imports.",
  },
  spoolhoarder: {
    kind: "CSV",
    how: "Export your inventory CSV from Spool Hoarder (Mac and iOS), or its HueForge library export, then choose or drop the file here. Spool Hoarder does not accept imports from SpoolSync.",
  },
  spoolapp: {
    kind: "JSON backup",
    how: "In the Spool app (Mac and iOS), create a JSON backup, then choose or drop the file here. Only the spools list is read; prints, printers, and business records are ignored. The app does not accept imports from SpoolSync.",
  },
  spoolkeep: {
    kind: "JSON backup",
    how: "Export a JSON backup from SpoolKeep (Mac and iOS), then choose or drop the file here. SpoolKeep counts spools instead of weighing them, so each counted spool loads with an unknown remaining weight. SpoolKeep does not accept imports from SpoolSync.",
  },
} as const satisfies Record<SourceId, SourceGuide>;
