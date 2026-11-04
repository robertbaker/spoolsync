import {
  backupFilename,
  createBackup,
  inspectBackup,
  restoreBackup,
  type BackupInspection,
} from "~/lib/saved-data";

import { h, setChildren } from "./dom";
import { download } from "./sync/presentation";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "3 preferences entries, 1 file history entry" from the groups an inspection accepted. */
function acceptedSummary(inspection: BackupInspection): string {
  const counts = new Map<string, number>();
  for (const entry of inspection.accepted) {
    const name = entry.group ?? "Other";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => `${name}: ${plural(count, "entry", "entries")}`)
    .join("; ");
}

/**
 * Backup and restore for the "Saved in this browser" dialog: one JSON file with every portable
 * setting, checked entry by entry. Restoring shows what the file contains first and only writes
 * after a confirmation; connections and tokens are never part of a backup. `onRestored` runs after
 * a restore so the dialog can reload the page once it closes.
 */
export function backupSection(onRestored: () => void): HTMLElement {
  const status = h("p", { class: "mt-2 text-xs", role: "status", "aria-live": "polite" });
  const preview = h("div", { class: "mt-2" });
  const replaceBox = h("input", { type: "checkbox", id: "backup-replace", class: "size-4" });
  const input = h("input", {
    type: "file",
    accept: ".json,application/json",
    class: "sr-only",
    id: "backup-file",
    "aria-label": "Backup file to restore",
  });
  const pick = h(
    "label",
    { class: `${BUTTON} cursor-pointer`, for: "backup-file" },
    "Restore from backup…",
  );
  const save = h("button", { type: "button", class: BUTTON }, "Download backup");

  const say = (message: string, tone: "ok" | "error" | "plain" = "plain") => {
    status.textContent = message;
    status.className = `mt-2 text-xs ${tone === "ok" ? "text-success-text" : tone === "error" ? "text-error-text" : ""}`;
  };

  save.addEventListener("click", () => {
    try {
      download(backupFilename(new Date()), createBackup(), "application/json");
    } catch {
      say("Could not create the backup file.", "error");
    }
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    preview.replaceChildren();
    if (!file) return;
    let text: string;
    let inspection: BackupInspection;
    try {
      text = await file.text();
      inspection = inspectBackup(text);
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not read that file.", "error");
      return;
    }
    if (!inspection.accepted.length) {
      say("Nothing in that file can be restored.", "error");
      preview.replaceChildren(skippedList(inspection));
      return;
    }
    say(
      `${file.name}${inspection.exportedAt ? ` (saved ${new Date(inspection.exportedAt).toLocaleString()})` : ""} contains ${acceptedSummary(inspection)}.`,
    );
    const confirm = h(
      "button",
      { type: "button", class: BUTTON, "data-action": "confirm-restore" },
      "Restore now",
    );
    confirm.addEventListener("click", () => {
      try {
        const result = restoreBackup(text, replaceBox.checked ? "replace" : "merge");
        onRestored();
        preview.replaceChildren();
        say(
          `Restored ${plural(result.accepted.length, "setting")}` +
            (result.removed.length
              ? `, removed ${result.removed.length} that the backup did not have`
              : "") +
            (result.skipped.length
              ? `; skipped ${result.skipped.length} that could not be used`
              : "") +
            ". The page reloads when you close this.",
          "ok",
        );
      } catch (error) {
        say(error instanceof Error ? error.message : "Could not restore the backup.", "error");
      }
    });
    setChildren(
      preview,
      h(
        "label",
        { class: "flex items-center gap-2 text-xs", for: "backup-replace" },
        replaceBox,
        "Replace my current settings instead of merging",
      ),
      inspection.skipped.length ? skippedList(inspection) : null,
      h("div", { class: "mt-2" }, confirm),
    );
    confirm.focus();
  });

  return h(
    "div",
    { class: "mt-4 border-t pt-3", "data-backup": "" },
    h("p", { class: "text-sm font-semibold" }, "Backup and restore"),
    h(
      "p",
      { class: "text-xs text-muted-foreground" },
      "One file with your preferences, saved views, file history, watchlist, trend history, match answers and weigh-in values. It never includes connections, tokens, loaded inventories or sync history.",
    ),
    h("div", { class: "mt-2 flex flex-wrap gap-2" }, save, pick, input),
    status,
    preview,
  );
}

function skippedList(inspection: BackupInspection): HTMLElement {
  return h(
    "details",
    { class: "mt-2 text-xs text-muted-foreground" },
    h(
      "summary",
      { class: "cursor-pointer" },
      `${plural(inspection.skipped.length, "entry", "entries")} will be skipped`,
    ),
    h(
      "ul",
      { class: "mt-1 list-disc pl-5" },
      ...inspection.skipped.map((skip) => h("li", {}, `${skip.key}: ${skip.reason}`)),
    ),
  );
}
