import { HEALTH_LABELS } from "@spoolsync/core/workflow";

import {
  EMPTY_VIEW,
  VIEW_GROUPS,
  VIEW_GROUP_LABELS,
  VIEW_PARAM,
  addView,
  cycleView,
  decodeViewParam,
  deleteView,
  describeSettings,
  parseGrams,
  readViews,
  renameView,
  sameSettings,
  saveViews,
  updateView,
  viewShareUrl,
  type SavedView,
  type ViewGroup,
  type ViewResult,
  type ViewSettings,
} from "~/lib/saved-views";

import { confirmDialog } from "../confirm-dialog";
import { h, showToast } from "../dom";
import { isTypingTarget } from "../shortcuts";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "field-input mt-0 py-1.5 text-xs";

/** The part of the inventory table the panel drives. */
export interface ViewTable {
  getViewSettings(): ViewSettings;
  applyViewSettings(settings: ViewSettings): void;
  onRender(listener: () => void): void;
}

const insightLabel = (id: string): string =>
  id === "duplicates"
    ? "possible duplicates"
    : id === "watched"
      ? "watched"
      : id === "missing-price"
        ? "no price"
        : ((HEALTH_LABELS as Record<string, string>)[id] ?? id);

/**
 * Saved views for the inventory table: pick, save, update, rename, and delete named combinations of
 * filters, sort and grouping, plus the material and weight-range filters that belong to a view.
 */
export function wireViewsPanel(root: HTMLElement, table: ViewTable, hasData: () => boolean) {
  let views: SavedView[] = readViews();
  let selectedId = "";

  const select = h("select", { id: "view-select", class: `${INPUT} w-auto min-w-40` });
  const nameInput = h("input", {
    id: "view-name",
    type: "text",
    maxlength: "60",
    placeholder: "View name, e.g. PLA under 200 g",
    "aria-label": "View name",
    class: `${INPUT} w-56`,
  });
  const saveNew = h("button", { type: "button", class: BUTTON }, "Save as new view");
  const update = h("button", { type: "button", class: BUTTON }, "Update view");
  const rename = h("button", { type: "button", class: BUTTON }, "Rename");
  const remove = h("button", { type: "button", class: BUTTON }, "Delete");
  const clear = h("button", { type: "button", class: BUTTON }, "Clear filters");
  const share = h(
    "button",
    { type: "button", class: BUTTON, "data-action": "share-view" },
    "Copy link",
  );
  share.title = "Copy a link that opens the Load page with these filters";
  const material = h("input", {
    id: "view-material",
    type: "text",
    maxlength: "100",
    placeholder: "e.g. PLA",
    "aria-label": "Material contains",
    class: `${INPUT} w-28`,
  });
  const min = h("input", {
    id: "view-min-grams",
    type: "text",
    inputmode: "decimal",
    placeholder: "min",
    "aria-label": "Remaining weight at least, in grams",
    class: `${INPUT} w-20`,
  });
  const max = h("input", {
    id: "view-max-grams",
    type: "text",
    inputmode: "decimal",
    placeholder: "max",
    "aria-label": "Remaining weight at most, in grams",
    class: `${INPUT} w-20`,
  });
  const group = h(
    "select",
    { id: "view-group", class: `${INPUT} w-auto`, "aria-label": "Group spools" },
    ...VIEW_GROUPS.map((value) => h("option", { value }, VIEW_GROUP_LABELS[value])),
  );
  const status = h("p", {
    class: "mt-2 min-h-5 text-xs text-muted-foreground",
    role: "status",
    "aria-live": "polite",
  });
  const rangeError = h("p", { class: "mt-1 text-xs text-error-text", role: "alert" });

  const selected = (): SavedView | undefined => views.find((view) => view.id === selectedId);
  const say = (message: string) => {
    status.textContent = message;
  };

  /** Writes the list; a blocked or full browser store means the change lasts for this visit only. */
  function persist(): void {
    if (!saveViews(views)) {
      showToast(
        "Could not save views in this browser; they will last until you leave the page",
        "warning",
      );
    }
  }

  function renderSelect(): void {
    if (selectedId && !selected()) selectedId = "";
    select.replaceChildren(
      h("option", { value: "" }, views.length ? "Current filters" : "No saved views yet"),
      ...views.map((view) => h("option", { value: view.id }, view.name)),
    );
    select.value = selectedId;
  }

  function syncControls(): void {
    const current = table.getViewSettings();
    // Typing in a box must not be overwritten by the redraw it caused.
    const active = document.activeElement;
    if (active !== material) material.value = current.material;
    if (active !== min) min.value = current.minGrams === null ? "" : String(current.minGrams);
    if (active !== max) max.value = current.maxGrams === null ? "" : String(current.maxGrams);
    group.value = current.group;
    const view = selected();
    const modified = view !== undefined && !sameSettings(view, current);
    update.disabled = !view || !modified;
    rename.disabled = !view;
    remove.disabled = !view;
    clear.disabled = sameSettings(current, EMPTY_VIEW);
    if (view) {
      // Only describe the state when it is not the status message of an action just taken.
      if (!status.dataset["keep"]) say(modified ? `"${view.name}" has unsaved changes.` : "");
    }
    delete status.dataset["keep"];
  }

  function announce(message: string): void {
    say(message);
    status.dataset["keep"] = "1";
  }

  function applyRangeInputs(): void {
    const low = parseGrams(min.value);
    const high = parseGrams(max.value);
    const invalid = low === "invalid" || high === "invalid";
    min.setAttribute("aria-invalid", String(low === "invalid"));
    max.setAttribute("aria-invalid", String(high === "invalid"));
    rangeError.textContent = invalid
      ? "Enter weights as plain numbers of grams, from 0 up (or leave a box empty)."
      : "";
    if (invalid) return;
    table.applyViewSettings({
      ...table.getViewSettings(),
      material: material.value,
      minGrams: low,
      maxGrams: high,
    });
  }

  function finish(result: ViewResult, message: string): boolean {
    if (!result.ok) {
      announce(result.error);
      nameInput.focus();
      return false;
    }
    views = result.views;
    selectedId = result.view.id;
    nameInput.value = result.view.name;
    persist();
    renderSelect();
    announce(message);
    syncControls();
    return true;
  }

  select.addEventListener("change", () => {
    selectedId = select.value;
    const view = selected();
    if (!view) {
      nameInput.value = "";
      announce("");
      syncControls();
      return;
    }
    nameInput.value = view.name;
    table.applyViewSettings(view);
    announce(`Applied "${view.name}": ${describeSettings(view, insightLabel)}.`);
    syncControls();
  });
  saveNew.addEventListener("click", () => {
    const current = table.getViewSettings();
    finish(addView(views, nameInput.value, current), `Saved "${nameInput.value.trim()}".`);
  });
  update.addEventListener("click", () => {
    const view = selected();
    if (view)
      finish(updateView(views, view.id, table.getViewSettings()), `Updated "${view.name}".`);
  });
  rename.addEventListener("click", () => {
    const view = selected();
    if (view)
      finish(
        renameView(views, view.id, nameInput.value),
        `Renamed to "${nameInput.value.trim()}".`,
      );
  });
  remove.addEventListener("click", async () => {
    const view = selected();
    if (!view) return;
    const confirmed = await confirmDialog({
      title: `Delete the view "${view.name}"?`,
      body: "The saved filters and sort are removed. Your inventory is not changed.",
      confirmLabel: "Delete view",
      tone: "danger",
    });
    if (!confirmed || selected()?.id !== view.id) return;
    views = deleteView(views, view.id);
    selectedId = "";
    nameInput.value = "";
    persist();
    renderSelect();
    announce(`Deleted "${view.name}".`);
    syncControls();
    select.focus();
  });
  clear.addEventListener("click", () => {
    table.applyViewSettings(EMPTY_VIEW);
    rangeError.textContent = "";
    min.removeAttribute("aria-invalid");
    max.removeAttribute("aria-invalid");
    announce("Filters cleared.");
    syncControls();
  });
  share.addEventListener("click", () => {
    const link = viewShareUrl(location.href, table.getViewSettings());
    navigator.clipboard.writeText(link).then(
      () => announce("Link copied. Anyone who opens it sees these filters on their own inventory."),
      () => announce("Could not copy the link."),
    );
  });

  // A shared link (?view=...) is applied once, the first time spools are on screen, so the
  // filters act on real data. It is removed from the address so a reload does not reapply it.
  let sharedView: ViewSettings | null = null;
  const params = new URLSearchParams(location.search);
  if (params.has(VIEW_PARAM)) {
    sharedView = decodeViewParam(params.get(VIEW_PARAM));
    params.delete(VIEW_PARAM);
    const query = params.toString();
    history.replaceState(
      null,
      "",
      `${location.pathname}${query ? `?${query}` : ""}${location.hash}`,
    );
    if (!sharedView) showToast("That view link is damaged, so no filters were applied.", "warning");
  }
  function applyShared(): void {
    if (!sharedView || !hasData()) return;
    const settings = sharedView;
    sharedView = null;
    selectedId = "";
    nameInput.value = "";
    renderSelect();
    table.applyViewSettings(settings);
    announce(`Applied a shared view: ${describeSettings(settings, insightLabel)}.`);
    syncControls();
  }

  // [ and ] step through the saved views (with "current filters" as one stop), outside text fields.
  document.addEventListener("keydown", (event) => {
    if ((event.key !== "[" && event.key !== "]") || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.defaultPrevented || isTypingTarget(document.activeElement)) return;
    if (root.hidden || !views.length || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    select.value = cycleView(views, selectedId, event.key === "]" ? 1 : -1);
    select.dispatchEvent(new Event("change"));
  });

  for (const input of [material, min, max]) input.addEventListener("input", applyRangeInputs);
  group.addEventListener("change", () => {
    table.applyViewSettings({ ...table.getViewSettings(), group: group.value as ViewGroup });
  });

  const field = (label: string, control: HTMLElement) =>
    h(
      "label",
      { class: "flex items-center gap-1.5 text-xs text-muted-foreground" },
      label,
      control,
    );

  root.replaceChildren(
    h(
      "div",
      { class: "rounded-xl border p-4" },
      h("h3", { class: "text-sm font-semibold" }, "Saved views"),
      h(
        "div",
        { class: "mt-3 flex flex-wrap items-center gap-2" },
        field("View", select),
        nameInput,
        saveNew,
        update,
        rename,
        remove,
      ),
      h(
        "div",
        { class: "mt-3 flex flex-wrap items-center gap-3" },
        field("Material", material),
        field("Left (g) from", min),
        field("to", max),
        group,
        clear,
        share,
      ),
      rangeError,
      status,
    ),
  );

  renderSelect();
  syncControls();
  table.onRender(() => {
    root.hidden = !hasData();
    syncControls();
  });

  return {
    /** Shows the panel only while something is loaded. */
    update(): void {
      root.hidden = !hasData();
      syncControls();
      applyShared();
    },
  };
}
