import { FilamentDbClient } from "@spoolsync/core/adapters/filamentdb";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { SourceId, LoadResult, WritableSourceId } from "@spoolsync/core/core/model";
import { snapshotMatchesTarget } from "@spoolsync/core/core/target";

import {
  loadSpoolmanConnection,
  loadFilamentDbConnection,
  loadTigertagSession,
} from "~/lib/browser/storage";

import { h } from "../dom";
import type { ApplyController } from "./apply-controller";
import type { DownloadController } from "./download-controller";
import { button } from "./presentation";

export function sourceActions(
  source: WritableSourceId,
  loaded: Map<SourceId, LoadResult>,
  changes: PlannedChange[],
  status: HTMLElement,
  controller: Pick<ApplyController, "run">,
  downloads: DownloadController,
) {
  let action: HTMLElement;
  let note = "";
  if (source === "spoolman") {
    const fromFile = loaded.get("spoolman")!.origin === "file";
    const downloadJson = downloads.button(
      "spoolman",
      () => loaded.get("spoolman")!,
      changes,
      status,
      { label: "Download Spoolman JSON", variant: fromFile ? "primary" : "outline" },
    );
    if (fromFile) {
      action = downloadJson;
      note =
        "Loaded from a file, so changes are saved as a download: every spool in Spoolman's API format, which other tools (and spoolio.net) can read.";
    } else {
      const apply = button(
        `Apply ${changes.length} change${changes.length === 1 ? "" : "s"} to Spoolman`,
        () => void controller.run("spoolman", changes, status),
        "primary",
      );
      const connection = loadSpoolmanConnection();
      const targetMatches = snapshotMatchesTarget(loaded.get("spoolman")!, connection?.baseUrl);
      apply.disabled = changes.length === 0 || !connection || !targetMatches;
      if (!targetMatches)
        note = "Connection changed. Fetch this server's inventory again before applying.";
      action = h("div", { class: "flex flex-wrap gap-2" }, apply, downloadJson);
    }
  } else if (source === "spoolio") {
    action = downloads.button("spoolio", () => loaded.get("spoolio")!, changes, status, {
      label: "Download Spoolio JSON",
      variant: "primary",
    });
    note =
      "Download your whole Spoolio inventory, even without changes, as a backup. Print logs and settings are kept as they were.";
  } else if (source === "tigertag") {
    const tigertag = loaded.get("tigertag")!;
    const fromCloud = tigertag.origin === "api";
    const downloadTtag = downloads.button("tigertag", () => tigertag, changes, status, {
      label: "Download TigerTag .ttag",
      variant: fromCloud ? "outline" : "primary",
    });
    downloadTtag.disabled = changes.length === 0;
    if (fromCloud) {
      const apply = button(
        `Apply ${changes.length} change${changes.length === 1 ? "" : "s"} to TigerTag`,
        () => void controller.run("tigertag", changes, status),
        "primary",
      );
      const session = loadTigertagSession();
      apply.disabled =
        changes.length === 0 || !session || !snapshotMatchesTarget(tigertag, session.uid);
      action = h("div", { class: "flex flex-wrap gap-2" }, apply, downloadTtag);
    } else {
      action = downloadTtag;
    }
    note = fromCloud
      ? "Loaded from the TigerTag cloud: Apply writes only the changed fields (both chips of a twin) to your account."
      : (tigertag as { file?: { exportedBy?: string | null } }).file?.exportedBy
        ? "Contains changed and new materials. Choose Restore in Studio's preview to keep IDs and remaining weights; it should already be selected for the exporting account."
        : "Choose Restore in Studio's import preview, even on an empty account. Restore keeps IDs and remaining weights; Import creates copies and resets weights to full.";
  } else {
    const buttons = [
      downloads.button(source, () => loaded.get(source)!, changes, status, {
        label: `Download ${source === "bambuddy" ? "Bambuddy CSV" : "JSON"}`,
        variant: "primary",
      }),
    ];
    if (source === "threeDfp" || source === "filameter" || source === "filadex")
      buttons.push(
        downloads.button(source, () => loaded.get(source)!, changes, status, {
          label: "Download CSV",
          variant: "outline",
          alternateIndex: 0,
        }),
      );
    for (const item of buttons)
      item.disabled =
        source === "bambuddy" ? !changes.some((change) => change.kind === "create") : false;
    if (source === "filamentdb" && loaded.get("filamentdb")!.origin === "api") {
      const connection = loadFilamentDbConnection();
      const apply = button(
        `Apply ${changes.length} change${changes.length === 1 ? "" : "s"} to FilamentDB`,
        () => void controller.run("filamentdb", changes, status),
        "primary",
      );
      apply.disabled =
        changes.length === 0 ||
        !connection ||
        !snapshotMatchesTarget(loaded.get("filamentdb")!, new FilamentDbClient(connection).baseUrl);
      buttons.unshift(apply);
    }
    action = h("div", { class: "flex flex-wrap gap-2" }, ...buttons);
    note =
      source === "bambuddy"
        ? "Bambuddy CSV imports always create entries. This file contains newly selected spools. Import it once, then reload your Bambuddy inventory before generating another export."
        : source === "filadex"
          ? "JSON preserves Filadex fields and IDs; CSV matches Filadex's own CSV import."
          : source === "filamentdb"
            ? loaded.get("filamentdb")!.origin === "api"
              ? "Loaded from your server: Apply writes each changed spool through POST /api/spools. The download is a JSON list you can post yourself."
              : "A JSON list of spools. FilamentDB takes them one at a time through POST /api/spools, or as <serial>.json files."
            : source === "filameter"
              ? "JSON preserves the FilaMeter backup and document IDs; CSV is available for its mapped CSV importer."
              : "Download a 3DFilamentProfiles export in JSON or CSV.";
  }
  return { action, note };
}
