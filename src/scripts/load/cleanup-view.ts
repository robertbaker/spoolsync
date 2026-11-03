import { CLEANUP_RULES, ruleById, type CleanupProposal } from "@spoolsync/core/core/cleanup";
import { FIELD_LABELS, formatValue } from "@spoolsync/core/core/compare";
import {
  SOURCE_LABELS,
  type CommonSpool,
  type ComparableField,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";

import {
  loadAcceptedCleanups,
  loadCleanupSettings,
  saveAcceptedCleanups,
  saveCleanupSettings,
} from "~/lib/browser/storage/cleanup";
import { formatMoney, formatWeight } from "~/lib/units";

import { h, showToast } from "../dom";
import { CleanupController, type CleanupStore } from "./cleanup-controller";
import { plural } from "./presentation";

/** Rows drawn at once; "Show more" draws the next batch. */
const PAGE = 60;
const WEIGHT_FIELDS: readonly ComparableField[] = [
  "initialWeight",
  "remainingWeight",
  "emptySpoolWeight",
];

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const PRESSED = "border-primary bg-primary/10 text-foreground";
const BADGE = {
  safe: "border-success/40 bg-success/10 text-success-text",
  review: "border-warning/40 bg-warning/10",
} as const;

const browserStore: CleanupStore = {
  loadSettings: loadCleanupSettings,
  saveSettings: saveCleanupSettings,
  loadAccepted: loadAcceptedCleanups,
  saveAccepted: saveAcceptedCleanups,
};

/**
 * A value as the person reads it: weights and prices in their chosen units, "(empty)" for none.
 * Text that was not a number yet (a price typed as "$24,99") is shown as written.
 */
export function displayValue(field: ComparableField, value: CleanupProposal["before"]): string {
  if (value === null || value === "") return "(empty)";
  if (typeof value === "number") {
    if (WEIGHT_FIELDS.includes(field)) return formatWeight(value);
    if (field === "price") return formatMoney(value);
  }
  return formatValue(field, value);
}

const spoolLabel = (spool: CommonSpool | undefined, key: string) =>
  spool
    ? [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || `Spool ${spool.sourceId}`
    : key;

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
 */
export function wireCleanupPanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  store: CleanupStore = browserStore,
  today: () => string = () => new Date().toISOString().slice(0, 10),
): { update(): void; open(): void } {
  const controller = new CleanupController(results, store, today);
  const details = h("details", {
    id: "cleanup-details",
    "data-panel": "cleanup",
    class: "rounded-xl border",
  });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-xl p-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Clean up data",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);
  root.replaceChildren(details);
  let limit = PAGE;

  function summaryText(): string {
    const counts = controller.counts();
    if (!counts.total) return "Clean up data (nothing to fix)";
    const accepted = counts.accepted ? `, ${counts.accepted} accepted` : "";
    return `Clean up data (${plural(counts.total, "suggestion")}${accepted})`;
  }

  function act(change: () => number, done: (count: number) => string): void {
    const key = document.activeElement?.getAttribute("data-key");
    const count = change();
    if (count) showToast(done(count), "info");
    draw();
    focusKey(key);
    summary.textContent = summaryText();
  }

  /** Puts focus back on the control that was used, since drawing replaces every control. */
  function focusKey(key: string | null | undefined): void {
    if (!key) return;
    [...content.querySelectorAll<HTMLElement>("[data-key]")]
      .find((element) => element.getAttribute("data-key") === key)
      ?.focus();
  }

  function rulesSection(): HTMLElement {
    const enabled = new Set(controller.settings.enabled);
    return h(
      "fieldset",
      { class: "mt-3" },
      h("legend", { class: "text-sm font-medium" }, "Rules"),
      h(
        "div",
        { class: "mt-2 grid gap-2 sm:grid-cols-2" },
        ...CLEANUP_RULES.map((rule) => {
          const input = h("input", {
            type: "checkbox",
            class: "mt-0.5 size-4 shrink-0",
            "data-key": `rule-${rule.id}`,
          });
          input.checked = enabled.has(rule.id);
          input.addEventListener("change", () => {
            const key = `rule-${rule.id}`;
            controller.setRule(rule.id, input.checked);
            limit = PAGE;
            draw();
            focusKey(key);
            summary.textContent = summaryText();
          });
          return h(
            "label",
            { class: "flex gap-2 rounded-lg border p-2 text-xs" },
            input,
            h(
              "span",
              {},
              h("span", { class: "block font-medium text-foreground" }, rule.label),
              h("span", { class: "block text-muted-foreground" }, rule.description),
            ),
          );
        }),
      ),
    );
  }

  function row(proposal: CleanupProposal, spools: Map<string, CommonSpool>): HTMLElement {
    const status = controller.status(proposal);
    const accept = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${status === "accepted" ? PRESSED : ""}`,
        "aria-pressed": String(status === "accepted"),
        "data-key": `accept-${proposal.id}`,
      },
      "Accept",
    );
    accept.disabled = !proposal.applicable;
    accept.addEventListener("click", () =>
      act(
        () => (status === "accepted" ? controller.reset([proposal.id]) : controller.accept([proposal.id])),
        (count) => (status === "accepted" ? `Took back ${plural(count, "choice")}` : `Accepted ${plural(count, "change")}`),
      ),
    );
    const reject = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${status === "rejected" ? PRESSED : ""}`,
        "aria-pressed": String(status === "rejected"),
        "data-key": `reject-${proposal.id}`,
      },
      "Reject",
    );
    reject.addEventListener("click", () =>
      act(
        () => (status === "rejected" ? controller.reset([proposal.id]) : controller.reject([proposal.id])),
        (count) => (status === "rejected" ? `Took back ${plural(count, "choice")}` : `Rejected ${plural(count, "change")}`),
      ),
    );
    const label = `${spoolLabel(spools.get(proposal.spoolKey), proposal.spoolKey)}, ${FIELD_LABELS[proposal.field]}`;
    accept.setAttribute("aria-label", `Accept change: ${label}`);
    reject.setAttribute("aria-label", `Reject change: ${label}`);
    return h(
      "li",
      { class: "rounded-lg border p-3 text-sm", "data-proposal": proposal.id },
      h(
        "div",
        { class: "flex flex-wrap items-start justify-between gap-3" },
        h(
          "div",
          { class: "min-w-0 flex-1" },
          h(
            "p",
            { class: "font-medium" },
            `${FIELD_LABELS[proposal.field]} · ${spoolLabel(spools.get(proposal.spoolKey), proposal.spoolKey)}`,
          ),
          h(
            "p",
            { class: "text-xs text-muted-foreground" },
            `${SOURCE_LABELS[proposal.source]} · ID ${proposal.sourceId}`,
          ),
          h(
            "p",
            { class: "mt-1 break-words" },
            h("del", { class: "text-muted-foreground" }, displayValue(proposal.field, proposal.before)),
            " → ",
            h("ins", { class: "font-medium no-underline" }, displayValue(proposal.field, proposal.after)),
          ),
          h("p", { class: "mt-1 text-xs text-muted-foreground" }, proposal.reason),
          proposal.bundle
            ? h(
                "p",
                { class: "mt-1 text-xs text-muted-foreground" },
                "Applied together with the other part of this change.",
              )
            : null,
          proposal.applicable
            ? null
            : h(
                "p",
                { class: "mt-1 text-xs text-warning-text" },
                `${SOURCE_LABELS[proposal.source]} cannot take this change, so it is only shown.`,
              ),
        ),
        h(
          "div",
          { class: "flex shrink-0 flex-col items-end gap-2" },
          h(
            "span",
            { class: `rounded-full border px-2 py-0.5 text-xs ${BADGE[proposal.confidence]}` },
            proposal.confidence === "safe" ? "Safe" : "Review",
          ),
          h("div", { class: "flex gap-2" }, accept, reject),
        ),
      ),
    );
  }

  function list(): HTMLElement {
    const spools = new Map<string, CommonSpool>();
    for (const loaded of results.values())
      for (const spool of loaded.spools) spools.set(`${spool.source}:${spool.sourceId}`, spool);
    const groups = controller.grouped();
    const total = groups.reduce((sum, group) => sum + group.proposals.length, 0);
    if (!total)
      return h(
        "p",
        { class: "mt-3 text-sm text-muted-foreground" },
        controller.counts().total
          ? "No suggestions match these filters."
          : "Nothing to clean up with the rules that are on.",
      );
    let remaining = limit;
    const sections: HTMLElement[] = [];
    for (const group of groups) {
      if (remaining <= 0) break;
      const shown = group.proposals.slice(0, remaining);
      remaining -= shown.length;
      sections.push(
        h(
          "section",
          { class: "mt-4" },
          h(
            "h4",
            { class: "text-sm font-semibold" },
            `${ruleById(group.rule).label} (${group.proposals.length})`,
          ),
          h("ul", { class: "mt-2 grid gap-2" }, ...shown.map((proposal) => row(proposal, spools))),
        ),
      );
    }
    if (total > limit) {
      const more = h(
        "button",
        { type: "button", class: `${BUTTON} mt-3`, "data-key": "show-more" },
        `Show ${Math.min(PAGE, total - limit)} more (${total - limit} not shown)`,
      );
      more.addEventListener("click", () => {
        limit += PAGE;
        draw();
      });
      sections.push(h("div", {}, more));
    }
    return h("div", {}, ...sections);
  }

  function draw(): void {
    const counts = controller.counts();
    const undo = h("button", { type: "button", class: BUTTON, "data-key": "undo" }, "Undo");
    const label = controller.undoLabel();
    undo.disabled = !label;
    if (label) undo.setAttribute("aria-label", `Undo ${label}`);
    undo.addEventListener("click", () => act(() => (controller.undo() ? 1 : 0), () => "Undone"));
    const acceptSafe = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "accept-safe" },
      "Select all safe",
    );
    acceptSafe.disabled = !controller.visible().some(
      (proposal) =>
        proposal.applicable &&
        proposal.confidence === "safe" &&
        controller.status(proposal) === "pending",
    );
    acceptSafe.addEventListener("click", () =>
      act(
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
      act(
        () => controller.clearChoices(),
        (count) => `Cleared ${plural(count, "choice")}`,
      ),
    );

    const duplicates = counts.accepted ? controller.newDuplicates() : [];
    const warnings = controller.warnings();
    const spoolNames = new Map<string, CommonSpool>();
    for (const loaded of results.values())
      for (const spool of loaded.spools) spoolNames.set(`${spool.source}:${spool.sourceId}`, spool);

    content.replaceChildren(
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Finds spacing, capitalization, naming, and number problems in what you loaded. Nothing changes until you accept it, and accepted changes are only planned: the Sync page lists each one before anything is written.",
      ),
      rulesSection(),
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
            limit = PAGE;
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
            limit = PAGE;
            draw();
          },
        ),
      ),
      duplicates.length
        ? h(
            "div",
            { class: "mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm", role: "status" },
            h("p", { class: "font-medium" }, "Possible duplicates after cleanup"),
            h(
              "p",
              { class: "mt-1 text-muted-foreground" },
              "These spools would look the same once your accepted changes are applied. Nothing is merged; check them on the Load page.",
            ),
            h(
              "ul",
              { class: "mt-1 list-disc pl-5" },
              ...duplicates.slice(0, 8).map((group) =>
                h(
                  "li",
                  {},
                  `${SOURCE_LABELS[group.source]}: ${group.spools
                    .map((spool) => `${spoolLabel(spool, spool.sourceId)} (ID ${spool.sourceId}${
                      spool.remainingWeight === null ? "" : `, ${formatWeight(spool.remainingWeight)} left`
                    })`)
                    .join(" and ")}`,
                ),
              ),
            ),
          )
        : null,
      list(),
      warnings.length
        ? h(
            "details",
            { class: "mt-4 rounded-lg border" },
            h(
              "summary",
              { class: "cursor-pointer p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary" },
              `Values to check (${warnings.length})`,
            ),
            h(
              "div",
              { class: "px-3 pb-3" },
              h(
                "p",
                { class: "text-xs text-muted-foreground" },
                "These look wrong but have no single fix, so they are never changed automatically.",
              ),
              h(
                "ul",
                { class: "mt-2 grid gap-1 text-sm" },
                ...warnings.slice(0, 100).map((warning) =>
                  h(
                    "li",
                    {},
                    `${spoolLabel(spoolNames.get(warning.spoolKey), warning.spoolKey)} (${SOURCE_LABELS[warning.source]} ID ${warning.sourceId}), ${FIELD_LABELS[warning.field]}: ${warning.message}`,
                  ),
                ),
              ),
              warnings.length > 100
                ? h("p", { class: "mt-1 text-xs text-muted-foreground" }, `and ${warnings.length - 100} more`)
                : null,
            ),
          )
        : null,
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
    limit = PAGE;
    draw();
  });

  return {
    update() {
      root.hidden = results.size === 0;
      controller.refresh();
      summary.textContent = summaryText();
      if (details.open && !root.hidden) draw();
    },
    open() {
      root.hidden = results.size === 0;
      details.open = true;
    },
  };
}
