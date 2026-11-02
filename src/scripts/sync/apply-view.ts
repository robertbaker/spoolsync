import { openConflicts, type GroupResolution } from "@spoolsync/core/core/compare";
import type { MatchResult } from "@spoolsync/core/core/match";
import {
  isWritableSource,
  SOURCE_IDS,
  SOURCE_LABELS,
  WRITABLE_SOURCE_IDS,
  type SourceId,
  type LoadResult,
} from "@spoolsync/core/core/model";
import { ensureResolution, planSync } from "@spoolsync/core/planner";
import { exportInventory } from "@spoolsync/core/workflow";

import { saveLoadResult } from "~/lib/browser/storage";

import { byId, h, notice } from "../dom";
import { ApplyController } from "./apply-controller";
import { counts, changeList, renderLog } from "./apply-presentation";
import { createApplyServices } from "./apply-services";
import { DownloadController } from "./download-controller";
import { button, download } from "./presentation";
import { sourceActions } from "./source-actions";

export function createApplyView(loaded: Map<SourceId, LoadResult>, onApplied: () => void) {
  const controller = new ApplyController(
    createApplyServices(),
    { loaded, onApplied },
    saveLoadResult,
  );
  const downloads = new DownloadController({
    exportInventory,
    download,
    today: () => new Date().toISOString().slice(0, 10),
  });

  function renderApply(match: MatchResult, resolutions: Map<string, GroupResolution>): void {
    const plan = planSync(match.groups, resolutions, match.suggestions);
    const sections: HTMLElement[] = [];
    const unresolved = match.groups.filter(
      (g) => openConflicts(g, ensureResolution(resolutions, g)).length,
    ).length;
    for (const source of SOURCE_IDS) {
      if (!loaded.has(source) || isWritableSource(source)) continue;
      const label = SOURCE_LABELS[source];
      sections.push(
        notice(
          "info",
          `${label} is read-only`,
          h(
            "p",
            { class: "mt-1" },
            `SpoolSync can compare its ${source === "spoolstock" ? "CSV exports" : "exports"} and use their values to update other services, but ${label} does not accept imports.`,
          ),
        ),
      );
    }
    if (unresolved) {
      sections.push(
        notice(
          "info",
          `${unresolved} spool${unresolved === 1 ? " has" : "s have"} open conflicts`,
          h(
            "p",
            { class: "mt-1" },
            "Those fields are left as they are in each service until you pick a value.",
          ),
        ),
      );
    }

    const writable = WRITABLE_SOURCE_IDS.filter((source) => loaded.has(source));
    // Bambuddy's CSV importer only creates entries, so a file without creations has nothing to import.
    const downloadable = writable.filter((source) => {
      const changes = plan.get(source) ?? [];
      return (
        changes.length > 0 &&
        (source !== "bambuddy" || changes.some((change) => change.kind === "create"))
      );
    });
    if (downloadable.length > 1) {
      const allStatus = h("div", { class: "mt-3", "aria-live": "polite" });
      const downloadAll = button(
        `Download all ${downloadable.length} updated files`,
        () => {
          void (async () => {
            downloadAll.disabled = true;
            allStatus.replaceChildren();
            for (const source of downloadable) {
              const result = h("div", { class: "mt-2" });
              await downloads.run(
                source,
                () => loaded.get(source)!,
                plan.get(source) ?? [],
                result,
              );
              allStatus.append(result);
              // Browsers may ask before allowing several downloads; pace them so each is registered.
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
            downloadAll.disabled = false;
          })();
        },
        "primary",
        { id: "download-all" },
      );
      sections.push(
        h(
          "div",
          { class: "rounded-xl border bg-muted/30 p-4" },
          h(
            "div",
            { class: "flex flex-wrap items-center justify-between gap-3" },
            h(
              "p",
              { class: "text-sm text-muted-foreground" },
              `${downloadable.map((source) => SOURCE_LABELS[source]).join(", ")} have changes. Your browser may ask to allow multiple downloads.`,
            ),
            downloadAll,
          ),
          allStatus,
        ),
      );
    }

    for (const source of writable) {
      const changes = plan.get(source) ?? [];
      const status = h("div", { class: "mt-3", "aria-live": "polite" });
      const log = renderLog(controller.logs.get(source));
      if (log) status.append(log);
      const { action, note } = sourceActions(
        source,
        loaded,
        changes,
        status,
        controller,
        downloads,
      );
      sections.push(
        h(
          "div",
          {},
          h(
            "div",
            { class: "flex flex-wrap items-center justify-between gap-2" },
            h(
              "h3",
              { class: "text-lg" },
              SOURCE_LABELS[source],
              h(
                "span",
                { class: "ml-2 text-sm font-normal text-muted-foreground" },
                counts(changes),
              ),
            ),
            action,
          ),
          note ? h("p", { class: "mt-1 text-xs text-muted-foreground" }, note) : null,
          changes.length ? changeList(changes) : null,
          status,
        ),
      );
    }
    byId("apply").replaceChildren(...sections);
  }

  return renderApply;
}
