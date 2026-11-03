import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import { forgetFile, readFileHistory } from "~/lib/browser/storage";

import { h } from "../dom";
import { plural } from "./presentation";
import type { LoadState } from "./state";

const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Shows, in each service's panel, which file was used last time. A browser will not reopen a file
 * for a page, so this is a reminder of what to choose, not a shortcut; the file's contents are
 * never stored. It is hidden while that service has something loaded.
 */
export function renderFileHistory(state: LoadState): void {
  const history = readFileHistory();
  for (const source of SOURCE_IDS) {
    const line = document.getElementById(`${source}-last-file`);
    if (!line) continue;
    const entry = history[source];
    line.hidden = !entry || state.results.has(source);
    if (!entry || line.hidden) {
      line.replaceChildren();
      continue;
    }
    const when = new Date(entry.loadedAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const forget = h(
      "button",
      { type: "button", class: "ml-2 underline hover:text-foreground" },
      "Forget",
    );
    forget.addEventListener("click", () => {
      forgetFile(source as SourceId);
      renderFileHistory(state);
    });
    line.replaceChildren(
      `Last time you used `,
      h("strong", { class: "font-medium text-foreground" }, entry.name),
      ` (${plural(entry.spools, "spool")}, ${formatSize(entry.size)}, ${when}). Browsers cannot reopen files for you, so choose it again.`,
      forget,
    );
  }
}
