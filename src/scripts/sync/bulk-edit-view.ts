import {
  BULK_EDIT_LIMITS,
  describeBulkEdit,
  editReachesGroup,
  servicesSupporting,
} from "@spoolsync/core/core/compare";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { h, showToast } from "../dom";
import { bulkEditFromForm, bulkEditResult } from "./bulk-edit-form";
import { button } from "./presentation";
import type { SyncSession } from "./session";

/** Dispatched on `document` whenever a card's "Select" box changes. */
export const SELECTION_CHANGED = "spoolsync:selection-changed";

export interface BulkEditDependencies {
  /** Recomputes and redraws everything (the plan changed). */
  renderAll(): void;
  /** Redraws the Differences cards only (selection changed). */
  renderGroups(): void;
}

function field(id: string, label: string, input: HTMLElement, hint: string): HTMLElement {
  return h(
    "div",
    { class: "grid gap-1" },
    h("label", { for: id, class: "text-sm font-medium" }, label),
    input,
    h("p", { class: "text-xs text-muted-foreground" }, hint),
  );
}

function supportText(key: "location" | "note" | "tag", loaded: Iterable<string>): string {
  const present = new Set(loaded);
  const services = servicesSupporting(key).filter((source) => present.has(source));
  return services.length
    ? `Written to ${services.map((source) => SOURCE_LABELS[source]).join(", ")}.`
    : "None of the loaded services you can write to stores this.";
}

/**
 * A panel above the Differences list: tick spools, then set a location, a note, or a tag on all of
 * them at once. The edits join the plan (preview, Apply and downloads) like any other change.
 */
export function createBulkEditView(state: SyncSession, dependencies: BulkEditDependencies) {
  const status = h("p", { class: "text-sm", role: "status", "aria-live": "polite" });
  const count = h("p", { class: "text-sm text-muted-foreground" });
  const edited = h("p", { class: "text-sm text-muted-foreground" });

  const location = h("input", {
    id: "bulk-edit-location",
    type: "text",
    maxlength: String(BULK_EDIT_LIMITS.location),
    class: "field-input w-full py-1.5 text-sm",
    autocomplete: "off",
  });
  const note = h("textarea", {
    id: "bulk-edit-note",
    rows: "2",
    maxlength: String(BULK_EDIT_LIMITS.note),
    class: "field-input w-full py-1.5 text-sm",
  });
  const tag = h("input", {
    id: "bulk-edit-tag",
    type: "text",
    maxlength: String(BULK_EDIT_LIMITS.tag),
    class: "field-input w-full py-1.5 text-sm",
    autocomplete: "off",
  });
  const checkbox = (id: string, label: string) => {
    const input = h("input", { id, type: "checkbox", class: "size-4" });
    return {
      input,
      element: h(
        "label",
        { for: id, class: "touch-target flex w-fit cursor-pointer items-center gap-2 text-sm" },
        input,
        label,
      ),
    };
  };
  const clearLocation = checkbox("bulk-edit-clear-location", "Clear location");
  const clearNote = checkbox("bulk-edit-clear-note", "Clear note");

  const apply = button("Add edit to selected", () => submit(), "primary");
  const remove = button("Remove edits from selected", () => removeFromSelected());
  const selectShown = button("Select shown", () => {
    const ids = [...document.querySelectorAll<HTMLElement>("#groups [data-group]")].map(
      (card) => card.dataset["group"]!,
    );
    state.setSelected(ids, true);
    dependencies.renderGroups();
    update();
  });
  const selectAll = button("Select all in list", () => {
    state.setSelected(
      state.visibleGroups().map((group) => group.id),
      true,
    );
    dependencies.renderGroups();
    update();
  });
  const clearSelection = button("Clear selection", () => {
    state.setSelected([...state.selected()], false);
    dependencies.renderGroups();
    update();
  });
  const clearAll = button("Clear all bulk edits", () => {
    const ids = [...state.bulkEdits().keys()];
    const cleared = state.clearBulkEdit(ids, undefined, "clearing all bulk edits");
    status.textContent = cleared
      ? `Removed bulk edits from ${cleared} ${cleared === 1 ? "spool" : "spools"}.`
      : "There are no bulk edits to remove.";
    dependencies.renderAll();
  });

  function selectedIds(): string[] {
    return [...state.selected()];
  }

  function submit(): void {
    const result = bulkEditFromForm({
      location: location.value,
      clearLocation: clearLocation.input.checked,
      note: note.value,
      clearNote: clearNote.input.checked,
      tag: tag.value,
    });
    if ("error" in result) {
      status.textContent = result.error;
      return;
    }
    const ids = selectedIds();
    if (!ids.length) {
      status.textContent = bulkEditResult(0, 0);
      return;
    }
    const changed = state.applyBulkEdit(
      ids,
      result.patch,
      `bulk edit: ${describeBulkEdit(result.patch)}`,
    );
    const unreachable = state.match.groups.filter(
      (group) => state.selected().has(group.id) && !editReachesGroup(group, result.patch),
    ).length;
    status.textContent =
      bulkEditResult(changed, ids.length) +
      (unreachable
        ? ` ${unreachable} of them have no service that can store it, so they will not change.`
        : "");
    if (changed) showToast(status.textContent, "info");
    dependencies.renderAll();
  }

  function removeFromSelected(): void {
    const ids = selectedIds();
    if (!ids.length) {
      status.textContent = bulkEditResult(0, 0);
      return;
    }
    const cleared = state.clearBulkEdit(ids, undefined, "removing bulk edits");
    status.textContent = cleared
      ? `Removed bulk edits from ${cleared} ${cleared === 1 ? "spool" : "spools"}.`
      : "None of the selected spools had a bulk edit.";
    dependencies.renderAll();
  }

  const panel = h(
    "details",
    { id: "bulk-edit", class: "mt-4 rounded-xl border bg-card" },
    h(
      "summary",
      { class: "touch-target cursor-pointer px-4 py-2 text-sm font-medium" },
      "Bulk edit",
    ),
    h(
      "div",
      { class: "grid gap-4 border-t p-4" },
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Tick spools below, then set a location, a note, or a tag on all of them. Leave a box empty to leave that field alone. Edits appear in the plan preview, where you can exclude or clear them.",
      ),
      h(
        "div",
        { class: "flex flex-wrap items-center gap-2" },
        selectShown,
        selectAll,
        clearSelection,
        count,
      ),
      h(
        "div",
        { class: "grid gap-4 sm:grid-cols-3" },
        h(
          "div",
          { class: "grid gap-2" },
          field(
            "bulk-edit-location",
            "Location",
            location,
            supportText("location", state.loaded.keys()),
          ),
          clearLocation.element,
        ),
        h(
          "div",
          { class: "grid gap-2" },
          field(
            "bulk-edit-note",
            "Note (replaces the existing note)",
            note,
            supportText("note", state.loaded.keys()),
          ),
          clearNote.element,
        ),
        field(
          "bulk-edit-tag",
          "Tag (added to the note as #tag)",
          tag,
          "Services keep no separate tags, so it is stored in the note once. " +
            supportText("tag", state.loaded.keys()),
        ),
      ),
      h("div", { class: "flex flex-wrap items-center gap-2" }, apply, remove, clearAll),
      edited,
      status,
    ),
  );

  function update(): void {
    const selected = state.selected().size;
    count.textContent = `${selected} selected`;
    apply.disabled = selected === 0;
    remove.disabled = selected === 0;
    const withEdits = state.bulkEdits().size;
    clearAll.disabled = withEdits === 0;
    edited.textContent = withEdits
      ? `${withEdits} ${withEdits === 1 ? "spool has" : "spools have"} a bulk edit in the plan.`
      : "No bulk edits in the plan.";
  }

  document.addEventListener(SELECTION_CHANGED, update);

  /** Mounts the panel once, right above the list; later calls only refresh the counts. */
  function render(): void {
    if (!panel.isConnected) document.getElementById("groups")?.before(panel);
    update();
  }

  return render;
}
