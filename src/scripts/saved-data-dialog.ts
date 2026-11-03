import { forgetEverything, forgetGroup, formatBytes, listSavedData } from "~/lib/saved-data";

import { h } from "./dom";

let dialog: HTMLDialogElement | undefined;
let changed = false;

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
      changed = true;
      rebuild(body);
    });
    return h(
      "li",
      { class: "flex items-start justify-between gap-3 border-t py-3 first:border-t-0" },
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
  body.replaceChildren(
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
    items.length
      ? h("ul", { class: "mt-4", "aria-live": "polite" }, ...rows)
      : h(
          "p",
          {
            id: "saved-data-empty",
            class:
              "mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground",
          },
          "Nothing is saved.",
        ),
    h(
      "div",
      { class: "mt-5 flex flex-wrap items-center justify-between gap-3" },
      items.length ? everything : h("span"),
      close,
    ),
  );
}

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const body = h("div", { class: "p-6" });
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
  rebuild(element.firstElementChild as HTMLElement);
  if (!element.open) element.showModal();
}

export function wireSavedData(): void {
  for (const trigger of document.querySelectorAll("[data-open-saved-data]"))
    trigger.addEventListener("click", openSavedData);
}
