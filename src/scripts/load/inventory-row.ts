import { SOURCE_LABELS, type CommonSpool, type SourceId } from "@spoolsync/core/core/model";
import { spoolKey } from "@spoolsync/core/workflow";

import { t, type MessageKey } from "~/lib/i18n";
import { OPEN_SPOOL_EVENT } from "~/lib/spool-detail";
import type { TableColumn } from "~/lib/table-columns";

import { h } from "../dom";
import type { LoadInsights } from "./insights";

/** The other services a spool is already linked to, in display order. */
const LINKS: ReadonlyArray<{
  source: SourceId;
  label: string;
  id: (ids: CommonSpool["crossIds"]) => string | undefined;
}> = [
  {
    source: "spoolman",
    label: "Spoolman",
    id: (ids) => (ids.spoolmanId !== undefined ? `#${ids.spoolmanId}` : undefined),
  },
  { source: "spoolstock", label: "Spoolstock", id: (ids) => ids.spoolstockShortId },
  { source: "spoolio", label: "Spoolio", id: (ids) => ids.spoolioId?.slice(0, 8) },
  { source: "tigertag", label: "TigerTag", id: (ids) => ids.tigertagUid?.slice(0, 14) },
  { source: "threeDfp", label: "3DFP", id: (ids) => ids.threeDfpId?.slice(0, 8) },
  {
    source: "bambuddy",
    label: "Bambuddy",
    id: (ids) => (ids.bambuddyId !== undefined ? `#${ids.bambuddyId}` : undefined),
  },
  { source: "filameter", label: "FilaMeter", id: (ids) => ids.filameterId?.slice(0, 8) },
  { source: "filadex", label: "Filadex", id: (ids) => ids.filadexId?.slice(0, 8) },
  { source: "filamentdb", label: "FilamentDB", id: (ids) => ids.filamentdbSerial?.slice(0, 8) },
  { source: "spoolmaster", label: "SpoolMaster", id: (ids) => ids.spoolmasterId },
  { source: "spoolhoarder", label: "Spool Hoarder", id: (ids) => ids.spoolhoarderId?.slice(0, 8) },
  { source: "spoolapp", label: "Spool", id: (ids) => ids.spoolappId?.slice(0, 8) },
  { source: "spoolkeep", label: "SpoolKeep", id: (ids) => ids.spoolkeepId?.slice(0, 8) },
];

function links(spool: CommonSpool): string {
  const parts: string[] = [];
  for (const link of LINKS) {
    if (link.source === spool.source) continue;
    const id = link.id(spool.crossIds);
    if (id) parts.push(`${link.label} ${id}`);
  }
  return parts.join(", ") || "—";
}

function swatches(colors: string[]): HTMLElement {
  if (!colors.length) return h("span", { class: "text-muted-foreground" }, "—");
  return h(
    "span",
    { class: "flex gap-1", title: colors.map((c) => `#${c}`).join(", ") },
    ...colors.slice(0, 4).map((color) => {
      const swatch = h("span", {
        class: "filament-swatch inline-block size-4 rounded-full border",
      });
      swatch.style.backgroundColor = `#${color}`;
      return swatch;
    }),
  );
}

function weight(spool: CommonSpool): string {
  const remaining = spool.remainingWeight === null ? "?" : Math.round(spool.remainingWeight);
  const initial = spool.initialWeight === null ? "?" : Math.round(spool.initialWeight);
  return `${remaining} / ${initial} g`;
}

const WARNING_PILL =
  "ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-text";

function watchButton(
  key: string,
  spool: CommonSpool,
  watching: boolean,
  insights: LoadInsights | undefined,
  onWatchChange: (() => void) | undefined,
): HTMLElement {
  const label =
    [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
  const button = h(
    "button",
    {
      type: "button",
      "aria-pressed": String(watching),
      "aria-label": `Watch ${label} (${SOURCE_LABELS[spool.source]} ${spool.sourceId})`,
      "data-watch": key,
      class:
        "rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground",
    },
    watching ? "Watching" : "Watch",
  );
  button.addEventListener("click", () => {
    insights?.toggleWatch(key);
    onWatchChange?.();
    // The table is redrawn, so hand keyboard focus to the same spool's button when it remains.
    document.querySelector<HTMLElement>(`[data-watch="${CSS.escape(key)}"]`)?.focus();
  });
  return button;
}

/** The spool's name as a button, which opens the detail drawer for keyboard and screen reader users. */
function detailsButton(key: string, name: string | null): HTMLElement {
  return h(
    "button",
    {
      type: "button",
      "data-open-spool": key,
      "aria-haspopup": "dialog",
      class:
        "text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary",
    },
    name ?? "—",
    h("span", { class: "sr-only" }, " (open details)"),
  );
}

export interface RowOptions {
  columns: readonly TableColumn[];
  insights: LoadInsights | undefined;
  onWatchChange: (() => void) | undefined;
  /** Whether the spool is below the low-stock rule. */
  low: boolean;
  /** A weight drop to flag on a watched spool, if there is one. */
  drop: { delta: number } | undefined;
}

/** One table row for a spool, with the cells for the chosen columns and its click-to-open handler. */
export function spoolRow(spool: CommonSpool, options: RowOptions): HTMLElement {
  const { columns, insights, onWatchChange, low, drop } = options;
  const key = spoolKey(spool);
  const watching = insights?.watched.has(key) ?? false;
  const flags = insights
    ? [
        insights.duplicateSpoolKeys.has(key) ? "Possible duplicate" : null,
        ...(insights.health.byKey.get(key) ?? []).map((issue) =>
          t(`health.factor.${issue}` as MessageKey),
        ),
        insights.missingPrice.has(key) ? t("health.factor.missing-price") : null,
      ].filter(Boolean)
    : [];
  const cells: Record<TableColumn, HTMLElement> = {
    source: h("td", { class: "whitespace-nowrap font-medium" }, SOURCE_LABELS[spool.source]),
    id: h(
      "td",
      { class: "max-w-40 truncate font-mono text-xs", title: spool.sourceId },
      spool.sourceId,
    ),
    vendor: h("td", {}, spool.vendor ?? "—"),
    material: h("td", {}, spool.material ?? "—"),
    name: h("td", {}, detailsButton(key, spool.name), spool.archived ? " (archived)" : ""),
    color: h("td", {}, swatches(spool.colors)),
    remaining: h(
      "td",
      { class: "whitespace-nowrap" },
      weight(spool),
      low ? h("span", { class: WARNING_PILL }, "Low") : null,
      drop ? h("span", { class: WARNING_PILL }, `Dropped ${Math.round(-drop.delta)} g`) : null,
    ),
    location: h("td", {}, spool.location ?? "—"),
    linked: h("td", { class: "text-xs" }, links(spool)),
  };
  const row = h(
    "tr",
    {
      "data-spool-row": "",
      class:
        `cursor-pointer hover:bg-muted/40 ${spool.archived ? "text-muted-foreground/70" : ""} ${drop ? "bg-warning/10" : ""}`.trim(),
      ...(flags.length ? { title: flags.join("; ") } : {}),
    },
    ...columns.map((column) => cells[column]),
    insights ? h("td", {}, watchButton(key, spool, watching, insights, onWatchChange)) : null,
  );
  // A click anywhere on the row opens the detail drawer, except on other controls and while
  // the visitor is selecting text. The name button is the keyboard route to the same action.
  row.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest("button, a, input, select, textarea, label");
    if (control && !control.hasAttribute("data-open-spool")) return;
    if (!control && window.getSelection()?.toString()) return;
    document.dispatchEvent(new CustomEvent(OPEN_SPOOL_EVENT, { detail: { key } }));
  });
  return row;
}
