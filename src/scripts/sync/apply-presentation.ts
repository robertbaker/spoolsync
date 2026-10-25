import { FIELD_LABELS, formatValue, type PlannedChange } from "@spoolsync/core/core/compare";
import type { ApplyLogEntry } from "@spoolsync/core/core/model";

import { h, notice } from "../dom";
import { spoolTitle } from "./presentation";

export function counts(changes: PlannedChange[]): string {
  const updates = changes.filter((c) => c.kind === "update").length;
  const creates = changes.length - updates;
  return `${updates} update${updates === 1 ? "" : "s"}, ${creates} new`;
}

export function changeList(changes: PlannedChange[]): HTMLElement {
  return h(
    "ul",
    { class: "mt-2 max-h-64 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground" },
    ...changes.map((change) =>
      change.kind === "update"
        ? h(
            "li",
            {},
            `${spoolTitle(change.spool)} (#${change.spool.sourceId}): `,
            [
              ...change.changes.map(
                (c) =>
                  `${FIELD_LABELS[c.field]} ${formatValue(c.field, c.from)} → ${formatValue(c.field, c.to)}`,
              ),
              ...(Object.keys(change.links).length ? ["link IDs"] : []),
            ].join("; "),
          )
        : h(
            "li",
            {},
            `New: ${[change.values.vendor, change.values.material, change.values.name].filter(Boolean).join(" ") || "spool"}`,
          ),
    ),
  );
}

export function renderLog(log: ApplyLogEntry[] | undefined): HTMLElement | null {
  if (!log) return null;
  const failed = log.filter((entry) => !entry.ok).length;
  return notice(
    failed ? "warning" : "success",
    failed ? `${log.length - failed} applied, ${failed} failed` : `${log.length} applied`,
    h(
      "ul",
      { class: "mt-1 max-h-64 list-disc overflow-y-auto pl-5" },
      ...log.map((entry) => h("li", { class: entry.ok ? "" : "font-medium" }, entry.message)),
    ),
  );
}
