/** Tiny DOM helpers for the client scripts. Text is always set as text, never parsed as HTML. */

import {
  baseClasses,
  outlineColorClasses,
  sizeClasses,
  solidColorClasses,
  type ButtonColor,
  type ButtonSize,
} from "~/components/starwind/controls/Button/buttonVariants";

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/**
 * Classes for a button built in script, matching the Starwind `Button` so the two cannot drift.
 * (The component's own `getButtonClasses` also runs tailwind-merge, which is not worth shipping to
 * every page, so this composes the same shared class maps directly.)
 */
export function buttonClass({
  variant = "outline",
  color = "neutral",
  size = "sm",
}: {
  variant?: "solid" | "outline";
  color?: ButtonColor;
  size?: ButtonSize;
} = {}): string {
  const style = variant === "solid" ? solidColorClasses[color] : outlineColorClasses[color];
  return `${baseClasses} motion-safe:active:scale-[0.98] ${style} ${sizeClasses[size]}`;
}

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const TONES = {
  success: "border-success/40 bg-success/10",
  error: "border-error/40 bg-error/10",
  warning: "border-warning/40 bg-warning/10",
  info: "border-info/40 bg-info/10",
} as const;

export type Tone = keyof typeof TONES;

export function notice(tone: Tone, title: string, ...body: Child[]): HTMLElement {
  return h(
    "div",
    {
      class: `rounded-md border p-4 text-sm ${TONES[tone]}`,
      role: tone === "error" ? "alert" : "status",
    },
    h("p", { class: "font-semibold" }, title),
    ...body,
  );
}

/** Transient toast notification (popover="manual" pattern with auto-dismiss). */
export function showToast(
  message: string,
  tone: Tone = "info",
  // Errors stay longer (WCAG 2.2.1): people need time to read what went wrong.
  durationMs = tone === "error" ? 8000 : 2800,
): HTMLElement {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = h("div", {
      id: "toast-container",
      class:
        "fixed bottom-[var(--toast-bottom)] right-5 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0",
      role: "region",
      "aria-label": "Notifications",
    });
    document.body.append(container);
  }

  const toast = h(
    "div",
    {
      class: `pointer-events-auto flex items-center justify-between gap-3 rounded-xl border p-3.5 text-sm shadow-lg backdrop-blur-md transition-all duration-200 motion-reduce:transition-none opacity-0 translate-y-2 bg-card ${TONES[tone]}`,
      role: tone === "error" ? "alert" : "status",
    },
    h("span", { class: "font-medium leading-snug" }, message),
    h(
      "button",
      {
        type: "button",
        class:
          "ml-2 shrink-0 rounded p-1 text-xs opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "aria-label": "Dismiss notification",
      },
      h("span", { "aria-hidden": "true" }, "✕"),
    ),
  );

  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = (restoreFocus = false) => {
    clearTimeout(timer);
    if (restoreFocus && toast.contains(document.activeElement)) {
      const sibling = toast.nextElementSibling ?? toast.previousElementSibling;
      const nextButton = sibling?.querySelector<HTMLElement>("button");
      if (nextButton) nextButton.focus();
      else if (opener?.isConnected) opener.focus();
    }
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 200);
  };
  const arm = () => {
    clearTimeout(timer);
    if (durationMs > 0) timer = setTimeout(() => dismiss(false), durationMs);
  };
  // Hovering or focusing a toast pauses its timer, so it can be read at any pace.
  toast.addEventListener("pointerenter", () => clearTimeout(timer));
  toast.addEventListener("pointerleave", arm);
  toast.addEventListener("focusin", () => clearTimeout(timer));
  toast.addEventListener("focusout", (event) => {
    if (!toast.contains(event.relatedTarget as Node | null)) arm();
  });

  toast.querySelector("button")?.addEventListener("click", () => dismiss(true));
  container.append(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "translate-y-2");
  });

  arm();

  return toast;
}

/** A copyable one-line code block. */
export function copyLine(text: string): HTMLElement {
  const button = h("button", { type: "button", class: buttonClass({ size: "xs" }) }, "Copy");
  button.addEventListener("click", () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        button.textContent = "Copied";
        showToast("Copied to clipboard", "success");
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      },
      () => (button.textContent = "Select and copy"),
    );
  });
  return h(
    "div",
    { class: "mt-2 flex items-center gap-2 rounded bg-background p-2" },
    h("code", { class: "min-w-0 flex-1 overflow-x-auto text-xs font-mono" }, text),
    button,
  );
}

/**
 * Replaces a node's children, leaving out `null`, `undefined` and `false`. The DOM's own
 * `replaceChildren` turns `null` into the text "null", so conditional children go through here.
 */
export function setChildren(parent: ParentNode, ...children: Child[]): void {
  parent.replaceChildren(
    ...children.filter((child): child is Node | string => !!child || child === ""),
  );
}

/**
 * Enables click-outside dismissal on a modal `<dialog>` using `closedby="any"` with a fallback
 * listener only for browsers that lack `closedBy` (such as Safari).
 */
export function enableBackdropDismiss(dialog: HTMLDialogElement): void {
  dialog.setAttribute("closedby", "any");
  if ("closedBy" in HTMLDialogElement.prototype) return;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

/** Moves keyboard focus to the first newly revealed item (or its primary control) after "Show more". */
export function focusRevealedItem(
  container: HTMLElement,
  selector: string,
  index: number,
): boolean {
  const item = container.querySelectorAll<HTMLElement>(selector)[index];
  if (!item) return false;
  const control = item.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)");
  if (control) {
    control.focus();
  } else {
    item.tabIndex = -1;
    item.focus();
  }
  return true;
}
