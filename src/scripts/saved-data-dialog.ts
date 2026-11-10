import { LOCALE_CHANGED } from "~/lib/i18n";
import {
  exportSettings,
  forgetEverything,
  forgetGroup,
  formatBytes,
  importSettings,
  listSavedData,
} from "~/lib/saved-data";

import { backupSection } from "./backup-section";
import { announceConnectionChange } from "./connections/events";
import { displaySettingsSection } from "./display-settings";
import { h } from "./dom";
import { download } from "./sync/presentation";

let dialog: HTMLDialogElement | undefined;
let changed = false;
const importResult = h("p", {
  id: "import-settings-result",
  class: "mt-2 text-xs",
  role: "status",
});

function rebuild(body: HTMLElement): void {
  const items = listSavedData();
  const rows = items.map(({ group, bytes, keys }) => {
    const forget = h(
      "button",
      {
        type: "button",
        class:
          "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
        "aria-label": `Forget ${group.label}`,
      },
      "Forget",
    );
    forget.addEventListener("click", () => {
      forgetGroup(group.id);
      if (group.id === "connections" || group.id === "inventories") announceConnectionChange();
      changed = true;
      rebuild(body);
    });
    return h(
      "li",
      {
        class: "flex items-start justify-between gap-3 border-t py-3 first:border-t-0",
      },
      h(
        "div",
        { class: "min-w-0" },
        h("p", { class: "text-sm font-semibold" }, group.label),
        h("p", { class: "text-xs text-muted-foreground" }, group.description),
        h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `${keys.length} ${keys.length === 1 ? "entry" : "entries"} · ${formatBytes(bytes)}`,
        ),
      ),
      forget,
    );
  });
  const everything = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border border-error/40 px-3 py-1.5 text-sm font-medium text-error hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Forget everything",
  );
  everything.addEventListener("click", () => {
    forgetEverything();
    announceConnectionChange();
    changed = true;
    rebuild(body);
  });
  const close = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Close",
  );
  close.addEventListener("click", () => dialog?.close());
  const buttonClass =
    "rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary";
  const exportButton = h("button", { type: "button", class: buttonClass }, "Export settings");
  exportButton.addEventListener("click", () =>
    download(
      `spoolsync-settings-${new Date().toISOString().slice(0, 10)}.json`,
      exportSettings(),
      "application/json",
    ),
  );
  const fileInput = h("input", {
    type: "file",
    accept: ".json,application/json",
    class: "sr-only",
    id: "import-settings-file",
    "aria-label": "Settings file to import",
  });
  const importButton = h(
    "label",
    { class: `${buttonClass} cursor-pointer`, for: "import-settings-file" },
    "Import settings",
  );
  const result = importResult;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const outcome = importSettings(await file.text());
      changed = changed || outcome.imported.length > 0;
      result.textContent =
        `Imported ${outcome.imported.length} ${outcome.imported.length === 1 ? "setting" : "settings"}` +
        (outcome.skipped.length
          ? `; skipped ${outcome.skipped.length} that could not be used (such as credentials)`
          : "") +
        ". The page reloads when you close this.";
      result.className = "mt-2 text-xs text-success-text";
      if (outcome.imported.length) rebuild(body);
    } catch (error) {
      result.textContent = (error as Error).message;
      result.className = "mt-2 text-xs text-error";
    }
  });
  const transfer = h(
    "section",
    { class: "mt-6 border-t pt-5", "aria-label": "Move to another browser" },
    h("p", { class: "text-sm font-semibold" }, "Move to another browser"),
    h(
      "p",
      { class: "mt-0.5 text-xs text-muted-foreground" },
      "Export your preferences, file history, and match answers to a file, then import it elsewhere. Connections and tokens are never included.",
    ),
    h("div", { class: "mt-3 flex flex-wrap gap-2" }, exportButton, importButton, fileInput),
    result,
  );
  const saved = h(
    "section",
    { class: "mt-6 border-t pt-5", "aria-labelledby": "saved-data-list-title" },
    h("h3", { id: "saved-data-list-title", class: "text-sm font-semibold" }, "What is remembered"),
    h(
      "p",
      { class: "mt-0.5 text-xs text-muted-foreground" },
      "Forget a group to remove just that; the page reloads when you close this.",
    ),
    items.length
      ? h("ul", { class: "mt-2", "aria-live": "polite" }, ...rows)
      : h(
          "p",
          {
            id: "saved-data-empty",
            class:
              "mt-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground",
          },
          "Nothing is saved.",
        ),
  );
  const strip = (section: HTMLElement) => {
    // Sections inside the scrolling area own their spacing; the first one needs none.
    section.classList.remove("mt-4", "border-t", "pt-3");
    section.classList.add("mt-6", "border-t", "pt-5");
    return section;
  };
  const display = displaySettingsSection();
  display.classList.remove("mt-4", "border-t", "pt-3");
  body.replaceChildren(
    h(
      "header",
      { class: "sticky top-0 z-10 border-b bg-background px-6 pb-3 pt-5" },
      h(
        "h2",
        { id: "saved-data-title", class: "text-xl font-bold tracking-tight" },
        "Saved in this browser",
      ),
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        "SpoolSync remembers these so things are ready when you come back. They never leave this browser.",
      ),
    ),
    h(
      "div",
      { class: "px-6 pb-6 pt-5" },
      display,
      saved,
      transfer,
      strip(
        backupSection(() => {
          changed = true;
        }),
      ),
    ),
    h(
      "footer",
      {
        class:
          "sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3",
      },
      items.length ? everything : h("span"),
      close,
    ),
  );
}

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const body = h("div", {});
  dialog = h(
    "dialog",
    {
      id: "saved-data-dialog",
      closedby: "any",
      class:
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
      "aria-labelledby": "saved-data-title",
    },
    body,
  );
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
  // Pages hold what they loaded in memory, so reload once something was forgotten.
  dialog.addEventListener("close", () => {
    if (changed) location.reload();
  });
  document.body.append(dialog);
  rebuild(body);
  return dialog;
}

export function openSavedData(): void {
  const element = ensureDialog();
  changed = false;
  importResult.textContent = "";
  rebuild(element.firstElementChild as HTMLElement);
  if (!element.open) element.showModal();
}

// Changing the language redraws the open dialog in place and keeps keyboard focus on the language
// control. This module loads on first use (see `lazy-tools.ts`), so it listens from then on; the
// language itself is applied to every page by the layout.
document.addEventListener(LOCALE_CHANGED, () => {
  if (!dialog?.open) return;
  const focused = document.activeElement?.id;
  rebuild(dialog.firstElementChild as HTMLElement);
  if (focused) document.getElementById(focused)?.focus();
});
