import {
  allSpools,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { spoolKey } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { LOCALE_CHANGED, t } from "~/lib/i18n";
import { OPEN_SPOOL_EVENT, findSpoolDetail } from "~/lib/spool-detail";
import { DISPLAY_CHANGED } from "~/lib/units";

import { h, showToast } from "../dom";
import type { LoadInsights } from "./insights";
import { BUTTON, actions, candidateList, type DrawerHooks } from "./spool-drawer-controls";
import { changesByKey, fieldTable, historyList, idsList, section } from "./spool-drawer-sections";
import { createWeighInSection, type WeighInMemory } from "./weigh-in-panel";

interface Inputs {
  results: ReadonlyMap<SourceId, LoadResult>;
  insights: LoadInsights;
  /** Called after an action changed what the page shows (watching, a new answer). */
  onChange: () => void;
}

/**
 * The spool detail drawer: a native modal `<dialog>` docked to the right, so focus stays inside,
 * Esc closes it, and the page behind is inert. It shows the spool as every loaded service sees it,
 * its linked ids, what is remembered about its weight, and quick actions.
 */
export function wireSpoolDrawer({ results, insights, onChange }: Inputs): {
  open(key: string): boolean;
  update(): void;
} {
  let dialog: HTMLDialogElement | undefined;
  let body: HTMLElement;
  let currentKey: string | null = null;
  let opener: HTMLElement | null = null;
  const weighMemory: WeighInMemory = new Map();

  const hooks: DrawerHooks = {
    insights,
    onChange,
    rerender: () => render(),
    focus: (selector) => dialog?.querySelector<HTMLElement>(selector)?.focus(),
  };

  function render(): void {
    if (!dialog || !currentKey) return;
    const detail = findSpoolDetail(
      allSpools(results.values()),
      currentKey,
      loadMatchDecisions(),
      insights.duplicates,
    );
    if (!detail) {
      // The spool was unloaded while the drawer was open.
      dialog.close();
      return;
    }
    const { spool } = detail;
    const title =
      [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
    const candidates = candidateList(detail, hooks);
    body.replaceChildren(
      h(
        "div",
        { class: "flex items-start justify-between gap-3" },
        h(
          "div",
          { class: "min-w-0" },
          h(
            "h2",
            {
              id: "spool-drawer-title",
              class: "break-words text-xl font-bold tracking-tight",
              tabindex: "-1",
              "data-drawer-title": "",
            },
            title,
          ),
          h(
            "p",
            { class: "mt-1 text-sm text-muted-foreground" },
            detail.columns.length > 1
              ? `Listed in ${detail.columns.length} services: ${detail.columns.map((c) => SOURCE_LABELS[c.source]).join(", ")}.`
              : `Listed in ${SOURCE_LABELS[spool.source]} only.`,
            spool.archived ? " Archived." : "",
          ),
        ),
        (() => {
          const close = h(
            "button",
            { type: "button", class: BUTTON, "aria-label": "Close spool details" },
            "Close",
          );
          close.addEventListener("click", () => dialog?.close());
          return close;
        })(),
      ),
      actions(detail, hooks),
      section(
        t("drawer.weighIn"),
        "drawer-weigh-heading",
        createWeighInSection(detail, weighMemory),
      ),
      section(t("drawer.fields"), "drawer-fields-heading", fieldTable(detail)),
      section(t("drawer.ids"), "drawer-ids-heading", idsList(detail)),
      section(
        t("drawer.history"),
        "drawer-history-heading",
        historyList(detail, changesByKey(insights.changes)),
      ),
      section(
        t("drawer.different"),
        "drawer-different-heading",
        candidates ?? h("p", { class: "mt-2 text-sm text-muted-foreground" }, t("drawer.noOthers")),
        candidates
          ? h(
              "p",
              { class: "mt-2 text-xs text-muted-foreground" },
              'A "different" answer is saved in this browser. The Sync page will not suggest that pair again.',
            )
          : null,
      ),
    );
  }

  function build(): HTMLDialogElement {
    body = h("div", { class: "p-6" });
    const element = h(
      "dialog",
      {
        id: "spool-drawer",
        closedby: "any",
        "aria-labelledby": "spool-drawer-title",
        class:
          "my-0 ml-auto mr-0 h-dvh max-h-none w-full max-w-3xl overflow-y-auto rounded-none border-l bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
      },
      body,
    );
    element.addEventListener("click", (event) => {
      if (event.target === element) element.close();
    });
    element.addEventListener("close", () => {
      const key = currentKey;
      currentKey = null;
      // The table is redrawn while the drawer is open, so look the opener up again.
      const target =
        opener?.isConnected && opener
          ? opener
          : key
            ? document.querySelector<HTMLElement>(`[data-open-spool="${CSS.escape(key)}"]`)
            : null;
      target?.focus();
      opener = null;
    });
    document.body.append(element);
    return element;
  }

  function open(key: string): boolean {
    if (!allSpools(results.values()).some((spool) => spoolKey(spool) === key)) return false;
    dialog ??= build();
    if (!dialog.open) {
      const active = document.activeElement;
      opener = active instanceof HTMLElement && active !== document.body ? active : null;
      currentKey = key;
      render();
      dialog.showModal();
    } else {
      currentKey = key;
      render();
    }
    dialog.querySelector<HTMLElement>("[data-drawer-title]")?.focus();
    return true;
  }

  document.addEventListener(OPEN_SPOOL_EVENT, (event) => {
    const key = (event as CustomEvent<{ key?: unknown } | null>).detail?.key;
    if (typeof key !== "string" || !key) return;
    if (!open(key)) showToast("That spool is not loaded.", "warning");
  });
  // Weights follow the display unit chosen elsewhere on the page.
  document.addEventListener(DISPLAY_CHANGED, () => {
    if (dialog?.open) render();
  });
  document.addEventListener(LOCALE_CHANGED, () => {
    if (dialog?.open) render();
  });

  return {
    open,
    update() {
      if (dialog?.open) render();
    },
  };
}
