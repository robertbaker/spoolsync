import { FIELD_LABELS, formatValue } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS, type LoadResult, type SourceId } from "@spoolsync/core/core/model";
import type { WritableSourceId } from "@spoolsync/core/core/model";
import {
  buildRollback,
  parseRollback,
  planRollback,
  serializeRollback,
  type RollbackDocument,
} from "@spoolsync/core/workflow";

import { readPreferences, updatePreferences } from "~/lib/preferences";

import { h, notice, setChildren } from "../dom";
import type { ApplyController } from "./apply-controller";
import { renderLog } from "./apply-presentation";
import { button, download } from "./presentation";

/** Whether a rollback file is saved before each write. On unless the person turned it off. */
export const rollbackEnabled = () => readPreferences().rollbackBeforeApply !== false;

/** Saves the rollback file through the browser's download, named for the service and the time. */
export function saveRollbackFile(document: RollbackDocument): void {
  const stamp = document.createdAt.replace(/[:.]/g, "-").replace(/Z$/, "");
  download(
    `spoolsync-rollback-${document.source}-${stamp}.json`,
    serializeRollback(document),
    "application/json",
  );
}

/** The ApplyController's hook: build and save the file just before a write. */
export const rollbackHook = {
  enabled: rollbackEnabled,
  build: (source: WritableSourceId, changes: Parameters<typeof buildRollback>[1], target: string) =>
    buildRollback(source, changes, { target, now: new Date() }),
  save: saveRollbackFile,
};

/** The checkbox that turns the automatic rollback file on or off. */
export function rollbackToggle(): HTMLElement {
  const box = h("input", {
    type: "checkbox",
    id: "rollback-before-apply",
    class: "mr-2 align-middle",
  });
  box.checked = rollbackEnabled();
  box.addEventListener("change", () => {
    updatePreferences({ rollbackBeforeApply: box.checked ? undefined : false });
  });
  return h(
    "div",
    { class: "rounded-md border p-3 text-sm" },
    h(
      "label",
      { for: "rollback-before-apply", class: "cursor-pointer" },
      box,
      "Save a rollback file before writing to a service (recommended)",
    ),
    h(
      "p",
      { class: "mt-1 text-xs text-muted-foreground" },
      "It lists the earlier value of every field about to change, so a sync can be taken back. Keep it somewhere safe; SpoolSync does not store it.",
    ),
  );
}

/**
 * "Roll back a sync": reads a rollback file, shows what can be put back right now against the
 * service's current values, and writes it through the same confirmed apply step as any other
 * change.
 */
export function createRollbackView(loaded: Map<SourceId, LoadResult>, controller: ApplyController) {
  const container = h("section", {
    id: "rollback",
    class: "mt-8 border-t pt-4",
    "aria-labelledby": "rollback-heading",
  });
  const input = h("input", {
    id: "rollback-file",
    type: "file",
    accept: ".json,application/json",
    class:
      "block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-xs",
    "aria-label": "Rollback file",
  });
  const result = h("div", { class: "mt-3", "aria-live": "polite" });
  setChildren(
    container,
    h("h3", { id: "rollback-heading", class: "text-lg" }, "Roll back a sync"),
    h(
      "p",
      { class: "mt-1 text-sm text-muted-foreground" },
      "Choose a rollback file saved before an earlier sync. Load that service first (on the Load page), then review what would be put back. Fields you changed since are never overwritten.",
    ),
    h("div", { class: "mt-3" }, input),
    result,
  );

  const describeValue = (
    field: Parameters<typeof formatValue>[0],
    value: Parameters<typeof formatValue>[1],
  ) => formatValue(field, value);

  async function read(file: File): Promise<void> {
    let document: RollbackDocument;
    try {
      document = parseRollback(await file.text());
    } catch (error) {
      setChildren(
        result,
        notice(
          "error",
          "Cannot use that file",
          h("p", { class: "mt-1" }, error instanceof Error ? error.message : String(error)),
        ),
      );
      return;
    }
    const label = SOURCE_LABELS[document.source];
    const inventory = loaded.get(document.source);
    if (!inventory) {
      setChildren(
        result,
        notice(
          "warning",
          `Load ${label} first`,
          h(
            "p",
            { class: "mt-1" },
            `SpoolSync needs ${label}'s current values to know what can safely be put back.`,
          ),
        ),
      );
      return;
    }
    const plan = planRollback(document, inventory);
    const when = document.createdAt
      ? new Date(document.createdAt).toLocaleString("en-GB")
      : "an earlier sync";
    const status = h("div", { class: "mt-3", "aria-live": "polite" });
    const restore = button(
      plan.fields
        ? `Restore ${plan.fields} ${plan.fields === 1 ? "field" : "fields"} in ${label}`
        : "Nothing to restore",
      async () => {
        restore.disabled = true;
        await controller.run(document.source, plan.changes, status);
        const log = renderLog(controller.logs.get(document.source));
        if (log) setChildren(status, log);
        restore.disabled = false;
      },
      "primary",
      { "data-action": "restore-rollback" },
    );
    restore.disabled = plan.fields === 0;
    setChildren(
      result,
      h(
        "p",
        { class: "text-sm" },
        `Rollback file for ${label} from ${when}: ${plan.fields} ${plan.fields === 1 ? "field" : "fields"} in ${plan.changes.length} ${plan.changes.length === 1 ? "spool" : "spools"} can be put back.`,
      ),
      plan.changes.length
        ? h(
            "ul",
            { class: "mt-2 grid gap-1 text-xs" },
            ...plan.changes
              .slice(0, 20)
              .map((change) =>
                h(
                  "li",
                  {},
                  `${change.spool.vendor ?? ""} ${change.spool.material ?? ""} ${change.spool.name ?? `#${change.spool.sourceId}`}: `.replace(
                    /\s+/g,
                    " ",
                  ),
                  change.changes
                    .map(
                      (item) =>
                        `${FIELD_LABELS[item.field]} ${describeValue(item.field, item.from)} → ${describeValue(item.field, item.to)}`,
                    )
                    .join("; "),
                ),
              ),
            plan.changes.length > 20
              ? h(
                  "li",
                  { class: "text-muted-foreground" },
                  `and ${plan.changes.length - 20} more spools`,
                )
              : null,
          )
        : null,
      plan.skipped.length
        ? h(
            "details",
            { class: "mt-2 text-xs" },
            h("summary", { class: "cursor-pointer" }, `${plan.skipped.length} left alone`),
            h(
              "ul",
              { class: "mt-1 list-disc pl-5 text-muted-foreground" },
              ...plan.skipped
                .slice(0, 50)
                .map((item) =>
                  h(
                    "li",
                    {},
                    `${item.label}${item.field ? `, ${FIELD_LABELS[item.field]}` : ""}: ${item.reason}`,
                  ),
                ),
            ),
          )
        : null,
      plan.creations.length
        ? h(
            "details",
            { class: "mt-2 text-xs" },
            h(
              "summary",
              { class: "cursor-pointer" },
              `${plan.creations.length} ${plan.creations.length === 1 ? "spool was" : "spools were"} created by that sync`,
            ),
            h(
              "p",
              { class: "mt-1 text-muted-foreground" },
              `SpoolSync never deletes spools. To undo these, delete them in ${label} yourself:`,
            ),
            h(
              "ul",
              { class: "mt-1 list-disc pl-5" },
              ...plan.creations.slice(0, 50).map((item) => h("li", {}, item.label)),
            ),
          )
        : null,
      h("div", { class: "mt-3" }, restore),
      status,
    );
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void read(file);
  });

  return { container };
}
