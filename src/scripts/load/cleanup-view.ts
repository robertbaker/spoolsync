import { ruleById } from "@spoolsync/core/core/cleanup";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import {
  loadAcceptedCleanups,
  loadCleanupSettings,
  saveAcceptedCleanups,
  saveCleanupSettings,
} from "~/lib/browser/storage/cleanup";
import { countCleanupSpools } from "~/lib/health-score";

import { h, setChildren, showToast } from "../dom";
import type { CleanupContext, CleanupState } from "./cleanup-context";
import { CleanupController, type CleanupStore } from "./cleanup-controller";
import { PAGE, list } from "./cleanup-list-view";
import { duplicatesNotice, warningsSection } from "./cleanup-notes-view";
import { rulesSection } from "./cleanup-rules-view";
import { BUTTON, focusDataKey, indexSpools } from "./panel-ui";
import { plural } from "./presentation";

export { displayValue } from "./cleanup-values";

const browserStore: CleanupStore = {
  loadSettings: loadCleanupSettings,
  saveSettings: saveCleanupSettings,
  loadAccepted: loadAcceptedCleanups,
  saveAccepted: saveAcceptedCleanups,
};

function select(
  label: string,
  id: string,
  options: ReadonlyArray<readonly [string, string]>,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const control = h("select", { id, class: "field-input mt-0 w-auto py-1 text-xs" });
  for (const [optionValue, text] of options) {
    const option = h("option", { value: optionValue }, text);
    option.selected = optionValue === value;
    control.append(option);
  }
  control.addEventListener("change", () => onChange(control.value));
  return h(
    "label",
    { for: id, class: "flex items-center gap-2 text-xs text-muted-foreground" },
    label,
    control,
  );
}

/**
 * The "Clean up data" panel on the Load page. It proposes changes to the loaded inventories and
 * lets the person accept or reject each one; accepting only saves a choice. The Sync page turns
 * accepted changes into planned updates, so nothing is written to a service from here.
 *
 * This module owns the shell, the toolbar and the redraw cycle; the rules, the suggestion list and
 * the notes are built by `cleanup-rules-view`, `cleanup-list-view` and `cleanup-notes-view`.
 */
export function wireCleanupPanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  store: CleanupStore = browserStore,
  today: () => string = () => new Date().toISOString().slice(0, 10),
): { update(dataChanged?: boolean): void; open(): void; applicableSpools(): number } {
  const controller = new CleanupController(results, store, today);
  const details = h("details", {
    id: "cleanup-details",
    "data-panel": "cleanup",
    class:
      "modern-card group rounded-2xl border border-border/80 bg-card/90 shadow-xs transition-all hover:border-primary/40",
  });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-2xl p-4 text-sm font-semibold text-foreground hover:text-primary-text transition-colors focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Clean up data",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);
  root.replaceChildren(details);
  const state: CleanupState = { limit: PAGE };
  let refreshed = false;

  function summaryText(): string {
    const counts = controller.counts();
    if (!counts.total) return "Clean up data (nothing to fix)";
    const accepted = counts.accepted ? `, ${counts.accepted} accepted` : "";
    return `Clean up data (${plural(counts.total, "suggestion")}${accepted})`;
  }

  const ctx: CleanupContext = {
    controller,
    results,
    state,
    draw,
    refreshSummary() {
      summary.textContent = summaryText();
    },
    focusKey: (key) => focusDataKey(content, key),
    act(change, done) {
      const key = document.activeElement?.getAttribute("data-key");
      const count = change();
      if (count) showToast(done(count), "info");
      draw();
      ctx.focusKey(key);
      ctx.refreshSummary();
    },
  };

  function draw(): void {
    const counts = controller.counts();
    const undo = h("button", { type: "button", class: BUTTON, "data-key": "undo" }, "Undo");
    const label = controller.undoLabel();
    undo.disabled = !label;
    if (label) undo.setAttribute("aria-label", `Undo ${label}`);
    undo.addEventListener("click", () =>
      ctx.act(
        () => (controller.undo() ? 1 : 0),
        () => "Undone",
      ),
    );
    const acceptSafe = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "accept-safe" },
      "Select all safe",
    );
    acceptSafe.disabled = !controller
      .visible()
      .some(
        (proposal) =>
          proposal.applicable &&
          proposal.confidence === "safe" &&
          controller.status(proposal) === "pending",
      );
    acceptSafe.addEventListener("click", () =>
      ctx.act(
        () => controller.acceptAllSafe(),
        (count) => `Accepted ${plural(count, "safe change")}`,
      ),
    );
    const clear = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "clear-choices" },
      "Clear choices",
    );
    clear.disabled = counts.accepted + counts.rejected === 0;
    clear.addEventListener("click", () =>
      ctx.act(
        () => controller.clearChoices(),
        (count) => `Cleared ${plural(count, "choice")}`,
      ),
    );

    const duplicates = counts.accepted ? controller.newDuplicates() : [];
    const warnings = controller.warnings();

    setChildren(
      content,
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Finds spacing, capitalization, naming, and number problems in what you loaded. Nothing changes until you accept it, and accepted changes are only planned: the Sync page lists each one before anything is written.",
      ),
      rulesSection(ctx),
      h(
        "p",
        { class: "mt-4 text-sm", "aria-live": "polite" },
        counts.total
          ? `${plural(counts.total, "suggestion")}: ${counts.safe} safe, ${counts.review} to review. ${counts.accepted} accepted, ${counts.rejected} rejected, ${counts.pending} undecided.` +
              (counts.notApplicable
                ? ` ${counts.notApplicable} cannot be applied to their service.`
                : "")
          : "No suggestions.",
      ),
      controller.dropped
        ? h(
            "p",
            { class: "mt-1 text-xs text-muted-foreground" },
            `${plural(controller.dropped, "earlier choice")} no longer matched the loaded data and was dropped.`,
          )
        : null,
      h(
        "div",
        { class: "mt-3 flex flex-wrap items-center gap-2" },
        acceptSafe,
        clear,
        undo,
        select(
          "Rule",
          "cleanup-filter-rule",
          [
            ["all", "All rules"],
            ...controller.settings.enabled.map((id) => [id, ruleById(id).label] as const),
          ],
          controller.filter.rule,
          (value) => {
            controller.setFilter({ rule: value as typeof controller.filter.rule });
            state.limit = PAGE;
            draw();
          },
        ),
        select(
          "Confidence",
          "cleanup-filter-confidence",
          [
            ["all", "All"],
            ["safe", "Safe"],
            ["review", "Review"],
          ],
          controller.filter.confidence,
          (value) => {
            controller.setFilter({ confidence: value as typeof controller.filter.confidence });
            state.limit = PAGE;
            draw();
          },
        ),
      ),
      duplicates.length ? duplicatesNotice(duplicates) : null,
      list(ctx),
      warnings.length ? warningsSection(warnings, indexSpools(results)) : null,
      counts.accepted
        ? h(
            "p",
            { class: "mt-4 text-sm" },
            `${plural(counts.accepted, "accepted change")} will appear in the plan on the Sync page. `,
            h(
              "a",
              {
                href: "/sync",
                class:
                  "font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary",
              },
              "Go to Sync",
            ),
          )
        : null,
    );
  }

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    state.limit = PAGE;
    draw();
  });

  return {
    /** `dataChanged` false only redraws: the suggestions already match the spools. */
    update(dataChanged = true) {
      root.hidden = results.size === 0;
      if (dataChanged || !refreshed) controller.refresh();
      refreshed = true;
      summary.textContent = summaryText();
      if (details.open && !root.hidden) draw();
    },
    open() {
      root.hidden = results.size === 0;
      details.open = true;
    },
    /** Spools with a suggestion that could be accepted, as of the last update. */
    applicableSpools() {
      return countCleanupSpools(controller.result.proposals);
    },
  };
}
