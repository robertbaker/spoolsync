import { h } from "../dom";
import type { TourView } from "./controller";
import { createTourHighlight } from "./highlight";
import type { TourStep } from "./steps";

export interface TourActions {
  clear(): void;
  launch(): void;
  goTo(index: number): void;
}

export function createTourView(steps: readonly TourStep[], actions: TourActions): TourView {
  const highlight = createTourHighlight();
  const dialog = h("dialog", {
    id: "spoolsync-tour-dialog",
    closedby: "any",
    class:
      "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
    "aria-labelledby": "spoolsync-tour-title",
    "aria-describedby": "spoolsync-tour-body",
  });
  const body = h("div", { class: "p-6 sm:p-7" });
  dialog.append(body);
  document.body.append(dialog);

  // Modern Web Guidance: Fallback for browsers without native closedby support
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInside) {
        actions.clear();
      }
    });
  }

  const launcher = h(
    "button",
    {
      type: "button",
      class:
        "fixed bottom-24 right-4 z-40 lg:bottom-4 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-layered lg:px-4 lg:py-2.5 lg:text-sm hover:bg-muted hover:border-primary/50 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      "aria-haspopup": "dialog",
    },
    "Take a tour",
  );
  launcher.addEventListener("click", () => {
    actions.launch();
  });
  document.body.append(launcher);

  function render(index: number): void {
    const step = steps[index];
    if (!step) return actions.clear();
    highlight.highlight(step.target);

    const position = h(
      "p",
      { class: "text-xs font-semibold uppercase tracking-wide text-primary" },
      `Tour · ${index + 1} of ${steps.length}`,
    );
    const title = h(
      "h2",
      { id: "spoolsync-tour-title", class: "mt-2 text-2xl font-bold tracking-tight" },
      step.title,
    );
    const description = h(
      "p",
      { id: "spoolsync-tour-body", class: "mt-3 text-sm leading-6 text-muted-foreground" },
      step.body,
    );
    const progress = h(
      "div",
      { class: "mt-5 flex gap-1.5", "aria-hidden": "true" },
      ...steps.map((_, stepIndex) =>
        h("span", {
          class: `h-1.5 flex-1 rounded-full ${stepIndex <= index ? "bg-primary" : "bg-muted"}`,
        }),
      ),
    );
    const skip = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      },
      "Skip tour",
    );
    skip.addEventListener("click", actions.clear);
    const previous = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        ...(index === 0 ? { disabled: "" } : {}),
      },
      "Back",
    );
    previous.addEventListener("click", () => actions.goTo(index - 1));
    const next = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      },
      index === steps.length - 1 ? "Finish" : "Next",
    );
    next.addEventListener("click", () =>
      index === steps.length - 1 ? actions.clear() : actions.goTo(index + 1),
    );
    const actionBar = h(
      "div",
      { class: "mt-6 flex items-center justify-between gap-3" },
      skip,
      h("div", { class: "flex gap-2" }, previous, next),
    );
    body.replaceChildren(position, title, description, progress, actionBar);
    if (!dialog.open) dialog.showModal();
    next.focus();
  }

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    actions.clear();
  });

  return {
    render,
    clear() {
      highlight.clear();
      if (dialog.open) dialog.close();
    },
    focusLauncher() {
      launcher.focus();
    },
  };
}
