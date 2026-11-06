import { h } from "./dom";

type Content = Node | string;

export interface ConfirmOptions {
  title: string;
  /** Supporting text or elements shown under the title. */
  body?: Content | Content[];
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button as destructive. */
  tone?: "default" | "danger";
}

let counter = 0;

/**
 * Asks for confirmation in a native modal `<dialog>` instead of `window.confirm`, so the prompt can
 * say what will happen, matches the rest of the UI and cannot be suppressed by the browser.
 *
 * Cancel has focus when it opens, Escape and a click outside cancel, and focus returns to what had
 * it before. Nothing here animates, so reduced-motion needs no special case.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const id = `confirm-dialog-${++counter}`;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const danger = options.tone === "danger";

  const cancel = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
      "data-confirm-cancel": "",
    },
    options.cancelLabel ?? "Cancel",
  );
  const confirm = h(
    "button",
    {
      type: "button",
      class: `rounded-md px-3.5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
        danger
          ? "bg-error text-white hover:opacity-90 focus-visible:outline-error"
          : "bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-primary"
      }`,
      "data-confirm-accept": "",
    },
    options.confirmLabel,
  );
  const body = options.body === undefined ? [] : [options.body].flat();
  const dialog = h(
    "dialog",
    {
      class:
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/40",
      "aria-labelledby": `${id}-title`,
      "aria-describedby": `${id}-body`,
    },
    h(
      "div",
      { class: "p-5" },
      h("h2", { id: `${id}-title`, class: "text-base font-semibold" }, options.title),
      h(
        "div",
        { id: `${id}-body`, class: "mt-2 space-y-2 text-sm text-muted-foreground" },
        ...body,
      ),
      h("div", { class: "mt-5 flex flex-wrap justify-end gap-2" }, cancel, confirm),
    ),
  );

  return new Promise<boolean>((resolve) => {
    let accepted = false;
    confirm.addEventListener("click", () => {
      accepted = true;
      dialog.close();
    });
    cancel.addEventListener("click", () => dialog.close());
    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (opener?.isConnected) opener.focus();
      resolve(accepted);
    });
    document.body.append(dialog);
    dialog.showModal();
    // Cancel is the safe default for a destructive or hard-to-undo action.
    cancel.focus();
  });
}
