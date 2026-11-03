import { h } from "./dom";
import { isTypingTarget } from "./shortcuts";

const SHORTCUTS: Array<[string, string]> = [
  ["/", "Focus the search or filter on this page"],
  ["?", "Show this list of shortcuts"],
  ["Ctrl/Cmd + Z", "Undo the last change on the Sync page; add Shift to redo"],
  [
    "S · D · N · Z",
    "While reviewing possible matches on Sync: same, different, skip for now, undo",
  ],
  ["Esc", "Close a dialog or the tour"],
];

let dialog: HTMLDialogElement | undefined;

/** Builds the dialog on first use so pages that never open it do not pay for it. */
function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const close = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Close",
  );
  dialog = h(
    "dialog",
    {
      id: "shortcuts-dialog",
      closedby: "any",
      class:
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
      "aria-labelledby": "shortcuts-title",
    },
    h(
      "div",
      { class: "p-6" },
      h(
        "h2",
        { id: "shortcuts-title", class: "text-xl font-bold tracking-tight" },
        "Keyboard shortcuts",
      ),
      h(
        "dl",
        { class: "mt-4 space-y-3 text-sm" },
        ...SHORTCUTS.flatMap(([key, description]) => [
          h(
            "div",
            { class: "flex items-center gap-3" },
            h(
              "dt",
              {},
              h(
                "kbd",
                {
                  class:
                    "inline-block min-w-8 rounded-md border bg-muted px-2 py-1 text-center font-mono text-xs",
                },
                key,
              ),
            ),
            h("dd", { class: "text-muted-foreground" }, description),
          ),
        ]),
      ),
      h("div", { class: "mt-6 flex justify-end" }, close),
    ),
  );
  close.addEventListener("click", () => dialog?.close());
  // Browsers without `closedby` still close when the backdrop is clicked.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
  document.body.append(dialog);
  return dialog;
}

export function openShortcutsHelp(): void {
  const element = ensureDialog();
  if (!element.open) element.showModal();
}

/** "?" opens the shortcuts list from anywhere a letter would not be typed into a field. */
export function wireShortcutsHelp(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || isTypingTarget(document.activeElement)) return;
    event.preventDefault();
    openShortcutsHelp();
  });
  for (const trigger of document.querySelectorAll("[data-open-shortcuts]"))
    trigger.addEventListener("click", openShortcutsHelp);
}
