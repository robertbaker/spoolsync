import {
  changeParts,
  FIELD_LABELS,
  formatValue,
  isBlank,
  type PlannedChange,
} from "@spoolsync/core/core/compare";
import {
  COMPARABLE_FIELDS,
  SOURCE_LABELS,
  type WritableSourceId,
} from "@spoolsync/core/core/model";

import { h } from "../dom";
import { spoolTitle } from "./presentation";

export interface PreviewItem {
  key: string;
  label: string;
  /** A few words naming the change, for the undo history. */
  short: string;
  excluded: boolean;
}

export interface PreviewSpool {
  groupId: string;
  title: string;
  kind: "update" | "create";
  items: PreviewItem[];
}

function linkText(links: object): string {
  return Object.entries(links)
    .map(([name, value]) => `${name} ${String(value)}`)
    .join(", ");
}

/** What a service will be asked to write, one entry per spool and one item per excludable part. */
export function previewPlan(
  changes: readonly PlannedChange[],
  excluded: ReadonlySet<string>,
): PreviewSpool[] {
  return changes.map((change) => {
    const keys = changeParts(change);
    const item = (key: string, label: string, short: string): PreviewItem => ({
      key,
      label,
      short,
      excluded: excluded.has(key),
    });
    if (change.kind === "create") {
      const values = COMPARABLE_FIELDS.filter((field) => !isBlank(change.values[field])).map(
        (field) => `${FIELD_LABELS[field]} ${formatValue(field, change.values[field])}`,
      );
      const links = Object.keys(change.links).length ? `; link IDs ${linkText(change.links)}` : "";
      return {
        groupId: change.groupId,
        title: `New spool: ${[change.values.vendor, change.values.material, change.values.name].filter(Boolean).join(" ") || "spool"}`,
        kind: "create" as const,
        items: [item(keys[0]!.key, `Create with ${values.join("; ")}${links}`, "the new spool")],
      };
    }
    return {
      groupId: change.groupId,
      title: `${spoolTitle(change.spool)} (#${change.spool.sourceId})`,
      kind: "update" as const,
      items: keys.map((part) => {
        if (part.kind === "links")
          return item(part.key, `Link IDs: ${linkText(change.links)}`, "link IDs");
        const field = part.field!;
        const found = change.changes.find((candidate) => candidate.field === field)!;
        return item(
          part.key,
          `${FIELD_LABELS[field]}: ${formatValue(field, found.from)} → ${formatValue(field, found.to)}`,
          FIELD_LABELS[field],
        );
      }),
    };
  });
}

export interface PreviewControls {
  isOpen(source: WritableSourceId): boolean;
  setOpen(source: WritableSourceId, open: boolean): void;
  setExcluded(key: string, excluded: boolean, label: string): void;
}

/** A collapsible dry-run of one service's writes, with a checkbox for every change. */
export function renderPreview(
  source: WritableSourceId,
  full: readonly PlannedChange[],
  excluded: ReadonlySet<string>,
  controls: PreviewControls,
): HTMLElement {
  const spools = previewPlan(full, excluded);
  const items = spools.flatMap((spool) => spool.items);
  const included = items.filter((item) => !item.excluded).length;
  const details = h(
    "details",
    { class: "mt-3 rounded-lg border", "data-preview": source },
    h(
      "summary",
      { class: "cursor-pointer px-3 py-2 text-sm font-medium" },
      `Preview changes to ${SOURCE_LABELS[source]} (${included} of ${items.length} included)`,
    ),
    h(
      "div",
      { class: "grid gap-3 px-3 pb-3" },
      h(
        "p",
        { class: "text-xs text-muted-foreground" },
        "Exactly what will be written. Untick a change to leave it out of Apply and the downloads.",
      ),
      ...spools.map((spool, index) => {
        const headingId = `preview-${source}-${index}`;
        return h(
          "section",
          { "aria-labelledby": headingId },
          h("h4", { id: headingId, class: "text-sm font-medium" }, spool.title),
          h(
            "ul",
            { class: "mt-1 grid list-none gap-1 pl-0" },
            ...spool.items.map((item) => {
              const box = h("input", {
                type: "checkbox",
                class: "mt-0.5 size-4 shrink-0",
                "data-change-key": item.key,
                "aria-describedby": headingId,
              });
              box.checked = !item.excluded;
              box.addEventListener("change", () =>
                controls.setExcluded(
                  item.key,
                  !box.checked,
                  `${box.checked ? "including" : "excluding"} ${item.short} for ${spool.title}`,
                ),
              );
              return h(
                "li",
                { class: "plan-item", "data-excluded": String(item.excluded) },
                h(
                  "label",
                  { class: "flex cursor-pointer items-start gap-2 text-sm" },
                  box,
                  h("span", { class: "plan-item-text text-muted-foreground" }, item.label),
                  item.excluded
                    ? h("span", { class: "text-xs font-medium whitespace-nowrap" }, "(excluded)")
                    : null,
                ),
              );
            }),
          ),
        );
      }),
    ),
  );
  details.open = controls.isOpen(source);
  details.addEventListener("toggle", () => controls.setOpen(source, details.open));
  return details;
}
