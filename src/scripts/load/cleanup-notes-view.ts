import type { CleanupWarning } from "@spoolsync/core/core/cleanup";
import { FIELD_LABELS } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import type { DuplicateGroup } from "@spoolsync/core/workflow";

import { formatWeight } from "~/lib/units";

import { h } from "../dom";
import { spoolLabel } from "./panel-ui";

/** Spools that would look the same once the accepted changes are applied. Nothing is merged. */
export function duplicatesNotice(duplicates: readonly DuplicateGroup[]): HTMLElement {
  return h(
    "div",
    {
      class: "mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm",
      role: "status",
    },
    h("p", { class: "font-medium" }, "Possible duplicates after cleanup"),
    h(
      "p",
      { class: "mt-1 text-muted-foreground" },
      "These spools would look the same once your accepted changes are applied. Nothing is merged; check them on the Load page.",
    ),
    h(
      "ul",
      { class: "mt-1 list-disc pl-5" },
      ...duplicates
        .slice(0, 8)
        .map((group) =>
          h(
            "li",
            {},
            `${SOURCE_LABELS[group.source]}: ${group.spools
              .map(
                (spool) =>
                  `${spoolLabel(spool, spool.sourceId)} (ID ${spool.sourceId}${
                    spool.remainingWeight === null
                      ? ""
                      : `, ${formatWeight(spool.remainingWeight)} left`
                  })`,
              )
              .join(" and ")}`,
          ),
        ),
    ),
  );
}

/** Values that look wrong but have no single fix, so they are never changed automatically. */
export function warningsSection(
  warnings: readonly CleanupWarning[],
  spoolNames: ReadonlyMap<string, CommonSpool>,
): HTMLElement {
  return h(
    "details",
    { class: "mt-4 rounded-lg border" },
    h(
      "summary",
      {
        class:
          "cursor-pointer p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary",
      },
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
        ...warnings
          .slice(0, 100)
          .map((warning) =>
            h(
              "li",
              {},
              `${spoolLabel(spoolNames.get(warning.spoolKey), warning.spoolKey)} (${SOURCE_LABELS[warning.source]} ID ${warning.sourceId}), ${FIELD_LABELS[warning.field]}: ${warning.message}`,
            ),
          ),
      ),
      warnings.length > 100
        ? h(
            "p",
            { class: "mt-1 text-xs text-muted-foreground" },
            `and ${warnings.length - 100} more`,
          )
        : null,
    ),
  );
}
