import { deriveCliChoices } from "@spoolsync/core/cli-choices";
import {
  changeParts,
  type BulkEdit,
  omitExcluded,
  openConflicts,
  type GroupResolution,
  type RecordEdits,
} from "@spoolsync/core/core/compare";
import type { MatchDecisions, MatchResult } from "@spoolsync/core/core/match";
import {
  isWritableSource,
  SOURCE_IDS,
  SOURCE_LABELS,
  WRITABLE_SOURCE_IDS,
  type SourceId,
  type LoadResult,
  type WritableSourceId,
} from "@spoolsync/core/core/model";
import { ensureResolution, planSync } from "@spoolsync/core/planner";
import { exportInventory } from "@spoolsync/core/workflow";

import { saveLoadResult } from "~/lib/browser/storage";

import { byId, h, notice, showToast } from "../dom";
import { ApplyController } from "./apply-controller";
import { counts, changeList, renderLog } from "./apply-presentation";
import { createApplyServices } from "./apply-services";
import { buildCliCommand } from "./cli-command";
import { DownloadController } from "./download-controller";
import { createHistoryView } from "./history-view";
import { createJumpBar } from "./jump-bar";
import { renderPreview } from "./plan-preview";
import { button, download } from "./presentation";
import { createRollbackView, rollbackHook, rollbackToggle } from "./rollback-view";
import { sourceActions } from "./source-actions";

/** The plan's exclusions and match answers, owned by the session so they can be undone. */
export interface PlanState {
  excluded(): ReadonlySet<string>;
  setExcluded(key: string, excluded: boolean, label: string): void;
  decisions(): MatchDecisions;
  /** Bulk edits to plan beside the resolutions; absent means none. */
  bulkEdits?(): ReadonlyMap<string, BulkEdit>;
  /** Accepted data cleanups by record key; absent means none. */
  recordEdits?(): RecordEdits;
  /**
   * How many of the record edits came from accepted cleanups and from accepted reference data, for
   * the notices. Absent means every record edit is a cleanup.
   */
  recordEditCounts?(): { cleanup: number; reference: number };
  clearBulkEdit?(groupId: string): void;
}

export function createApplyView(
  loaded: Map<SourceId, LoadResult>,
  onApplied: () => void,
  planState: PlanState,
) {
  const openPreviews = new Set<WritableSourceId>();
  const history = createHistoryView();
  history.container.className = "mt-8 border-t pt-4";
  history.container.id = "sync-history";
  const controller = new ApplyController(
    createApplyServices(),
    { loaded, onApplied },
    saveLoadResult,
    undefined,
    history.record,
    rollbackHook,
  );
  const rollbackView = createRollbackView(loaded, controller);
  const downloads = new DownloadController({
    exportInventory,
    download,
    today: () => new Date().toISOString().slice(0, 10),
    record: history.record,
  });

  const jumpBar = createJumpBar();

  function renderApply(match: MatchResult, resolutions: Map<string, GroupResolution>): void {
    const bulkEdits = planState.bulkEdits?.() ?? new Map<string, BulkEdit>();
    const recordEdits = planState.recordEdits?.() ?? new Map();
    const fullPlan = planSync(match.groups, resolutions, match.suggestions, bulkEdits, recordEdits);
    const excluded = planState.excluded();
    // Everything below (counts, Apply, downloads) sees only the changes that are still included.
    const plan = omitExcluded(fullPlan, excluded);
    const focusedKey = document.activeElement?.getAttribute("data-change-key");
    const withChanges = [...plan.values()].filter((changes) => changes.length > 0);
    jumpBar.update({
      changes: withChanges.reduce((total, changes) => total + changes.length, 0),
      services: withChanges.length,
      pending: match.suggestions.length,
    });
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
    const edited = [...recordEdits.values()].reduce(
      (sum, edit) => sum + Object.keys(edit).length,
      0,
    );
    const editCounts = planState.recordEditCounts?.() ?? { cleanup: edited, reference: 0 };
    const cleanups = editCounts.cleanup;
    if (editCounts.reference) {
      sections.push(
        notice(
          "info",
          `${editCounts.reference} accepted reference ${editCounts.reference === 1 ? "change is" : "changes are"} in this plan`,
          h(
            "p",
            { class: "mt-1" },
            "You accepted these under Reference data on the Load page. Each shows as a field change below and can be left out. The copied CLI command does not include them; use its --reference option with the same file for the confident fills.",
          ),
        ),
      );
    }
    if (cleanups) {
      sections.push(
        notice(
          "info",
          `${cleanups} accepted data ${cleanups === 1 ? "cleanup is" : "cleanups are"} in this plan`,
          h(
            "p",
            { class: "mt-1" },
            "You accepted these under Clean up data on the Load page. Each shows as a field change below and can be left out. The copied CLI command does not include them; use its --cleanup option for the safe ones.",
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
    const totalChanges = writable.reduce((sum, source) => sum + (plan.get(source) ?? []).length, 0);
    if (totalChanges > 0) {
      const copy = button("Copy plan summary", () => {
        const lines = [
          `SpoolSync plan: ${totalChanges} ${totalChanges === 1 ? "change" : "changes"}`,
          ...writable.map(
            (source) => `- ${SOURCE_LABELS[source]}: ${counts(plan.get(source) ?? [])}`,
          ),
          ...(unresolved
            ? [
                `${unresolved} ${unresolved === 1 ? "spool has" : "spools have"} open conflicts left as they are`,
              ]
            : []),
          ...(match.suggestions.length
            ? [
                `${match.suggestions.length} possible ${match.suggestions.length === 1 ? "match" : "matches"} still to answer`,
              ]
            : []),
        ];
        navigator.clipboard.writeText(lines.join("\n")).then(
          () => showToast("Plan summary copied", "success"),
          () => showToast("Could not copy the summary", "error"),
        );
      });
      copy.id = "copy-plan";
      const copyCli = button("Copy as CLI command", () => {
        const choices = deriveCliChoices(
          match.groups,
          resolutions,
          planState.decisions(),
          match.suggestions,
          plan,
          SOURCE_IDS.filter((source) => loaded.has(source)),
        );
        const command = buildCliCommand({
          loaded,
          choices,
          plan,
          excludedCount: [...fullPlan.values()]
            .flat()
            .flatMap((change) => changeParts(change))
            .filter((part) => excluded.has(part.key)).length,
        });
        navigator.clipboard.writeText(command.text).then(
          () =>
            showToast(
              command.caveats.length
                ? "CLI command copied; it differs from this plan (see the note)"
                : "CLI command copied",
              command.caveats.length ? "warning" : "success",
            ),
          () => showToast("Could not copy the command", "error"),
        );
        cliNote.replaceChildren(
          ...command.caveats.map((caveat) => h("span", { class: "block" }, caveat)),
          ...(command.caveats.length
            ? []
            : [
                "The command reproduces this plan. Addresses, files and the output folder are placeholders; tokens come from environment variables.",
              ]),
        );
      });
      copyCli.id = "copy-cli";
      const cliNote = h("p", {
        id: "cli-note",
        class: "mt-2 text-right text-xs text-muted-foreground",
        "aria-live": "polite",
      });
      sections.push(
        h("div", { class: "flex flex-wrap justify-end gap-2" }, copy, copyCli),
        cliNote,
      );
    }
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

    if (writable.length) sections.push(rollbackToggle());
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
          (fullPlan.get(source) ?? []).length
            ? renderPreview(
                source,
                fullPlan.get(source) ?? [],
                excluded,
                {
                  isOpen: (name) => openPreviews.has(name),
                  setOpen: (name, open) => {
                    if (open) openPreviews.add(name);
                    else openPreviews.delete(name);
                  },
                  setExcluded: planState.setExcluded,
                  ...(planState.clearBulkEdit ? { clearBulkEdit: planState.clearBulkEdit } : {}),
                },
                bulkEdits,
              )
            : null,
          status,
        ),
      );
    }
    byId("apply").replaceChildren(...sections);
    if (!history.container.isConnected) {
      byId("apply").after(history.container);
      history.render();
    }
    if (!rollbackView.container.isConnected) history.container.before(rollbackView.container);
    // A toggle redraws the plan; keep the keyboard on the checkbox that was used.
    if (focusedKey)
      byId("apply")
        .querySelector<HTMLElement>(`[data-change-key="${CSS.escape(focusedKey)}"]`)
        ?.focus();
  }

  return renderApply;
}
