import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import type { ReferenceIO } from "@spoolsync/core/core/reference";

import { browserReferenceIO } from "~/lib/browser/reference-io";
import { browserSnapshots } from "~/lib/browser/reference-snapshot";
import {
  clearReferenceCache,
  loadAcceptedReferences,
  loadReferenceCache,
  loadReferenceCatalog,
  loadReferenceChoices,
  loadReferenceRuledOut,
  loadReferenceSettings,
  saveAcceptedReferences,
  saveReferenceCacheEntry,
  saveReferenceChoices,
  saveReferenceRuledOut,
  saveReferenceSettings,
  touchReferenceCache,
} from "~/lib/browser/storage/reference";

import { h, setChildren, showToast } from "../dom";
import { plural } from "./presentation";
import type { PanelContext, PanelState } from "./reference-context";
import {
  ReferenceController,
  type ReferenceSnapshots,
  type ReferenceStore,
} from "./reference-controller";
import { policySection } from "./reference-policy-view";
import { resultsSection } from "./reference-results-view";
import { catalogSection, sourceSection } from "./reference-source-view";
import { PAGE } from "./reference-widgets";

const browserStore: ReferenceStore = {
  loadSettings: loadReferenceSettings,
  saveSettings: saveReferenceSettings,
  loadAccepted: loadAcceptedReferences,
  saveAccepted: saveAcceptedReferences,
  loadChoices: loadReferenceChoices,
  saveChoices: saveReferenceChoices,
  loadRuledOut: loadReferenceRuledOut,
  saveRuledOut: saveReferenceRuledOut,
  loadCache: loadReferenceCache,
  loadCatalog: loadReferenceCatalog,
  saveCache: saveReferenceCacheEntry,
  touchCache: touchReferenceCache,
  clearCache: clearReferenceCache,
};

/**
 * The "Reference data" panel on the Load page. It matches the loaded inventories against a
 * reference catalog (a file you load, or a service you configure and fetch in this browser), shows
 * what the reference would fill in or correct beside what you have, and lets you accept or reject
 * each change. Accepting only saves a choice; the Sync page turns accepted changes into planned
 * updates, so nothing is written to a service from here.
 *
 * This module owns the shell and the redraw cycle. The sections are built by
 * `reference-source-view` (source and catalog), `reference-policy-view` and
 * `reference-results-view` (with `reference-card`), through the shared `PanelContext`.
 */
export function wireReferencePanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  store: ReferenceStore = browserStore,
  io: ReferenceIO = browserReferenceIO,
  snapshots: ReferenceSnapshots | null = browserSnapshots,
): { update(): void; open(): void; controller: ReferenceController } {
  const controller = new ReferenceController(results, store, io, snapshots);
  const details = h("details", {
    id: "reference-details",
    "data-panel": "reference",
    class:
      "modern-card group rounded-2xl border border-border/80 bg-card/90 shadow-xs transition-all hover:border-primary/40",
  });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-2xl p-4 text-sm font-semibold text-foreground hover:text-primary-text transition-colors focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Reference data",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);

  const state: PanelState = {
    limit: PAGE,
    sourceMessage: null,
    drafts: new Map(),
    settingsErrors: [],
    barcodeQuery: "",
    finder: null,
  };

  function summaryText(): string {
    const counts = controller.counts();
    if (!controller.catalog) return "Reference data (no catalog loaded)";
    const parts = [] as string[];
    if (counts.proposals) parts.push(plural(counts.proposals, "suggestion"));
    if (counts.needChoice) parts.push(`${counts.needChoice} to choose`);
    if (counts.accepted) parts.push(`${counts.accepted} accepted`);
    return parts.length
      ? `Reference data (${parts.join(", ")})`
      : "Reference data (nothing to fix)";
  }

  const ctx: PanelContext = {
    controller,
    store,
    results,
    content,
    state,
    draw,
    refreshSummary() {
      summary.textContent = summaryText();
    },
    focusKey,
    act(change, done) {
      const key = document.activeElement?.getAttribute("data-key");
      const count = change();
      if (count) showToast(done(count), "info");
      draw();
      focusKey(key);
      ctx.refreshSummary();
    },
  };

  function focusKey(key: string | null | undefined): void {
    if (!key) return;
    content.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  // One listener for every card, so a re-draw never leaves a stale handler behind.
  content.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== "a" && key !== "r") return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const spoolKey = target.closest<HTMLElement>("li[data-spool]")?.dataset["spool"];
    const item = spoolKey
      ? controller.visible().find((entry) => entry.spoolKey === spoolKey)
      : undefined;
    const ids = (item?.proposals ?? [])
      .filter((proposal) => proposal.applicable && controller.status(proposal) === "pending")
      .map((proposal) => proposal.id);
    if (!ids.length) return;
    event.preventDefault();
    ctx.act(
      () => (key === "a" ? controller.accept(ids) : controller.reject(ids)),
      (count) => `${key === "a" ? "Accepted" : "Rejected"} ${plural(count, "change")}`,
    );
  });
  root.replaceChildren(details);

  function draw(): void {
    const held = controller.heldCount();
    setChildren(
      content,
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Matches your spools to a reference catalog of filaments, then shows what it could fill in (missing temperatures, weights, barcodes, colors) or correct, with colors compared side by side. Nothing changes until you accept it, and accepted changes are only planned: the Sync page lists each one before anything is written. Spools that fit several records are never matched for you.",
      ),
      sourceSection(ctx),
      catalogSection(ctx),
      controller.catalog ? policySection(ctx) : null,
      controller.catalog
        ? resultsSection(ctx)
        : h(
            "p",
            { class: "mt-4 text-sm text-muted-foreground" },
            held
              ? `${plural(held, "accepted change")} from an earlier visit ${held === 1 ? "is" : "are"} kept. Load the same reference again to review ${held === 1 ? "it" : "them"}.`
              : "Load a reference file, or fetch a catalog, to start.",
          ),
    );
  }

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    state.limit = PAGE;
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
    controller,
  };
}
