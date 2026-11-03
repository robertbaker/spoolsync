import { h } from "../dom";

/** One labelled horizontal bar with its value at the tip, a tooltip, and an accessible name. */
export function barRow(row: {
  label: string;
  /** Bar length as a percentage of the track. */
  widthPercent: number;
  valueText: string;
  description: string;
  tooltip: string;
}): HTMLElement {
  const bar = h("div", {
    class: "chart-bar h-4 rounded-r-[4px]",
    style: `width:${row.widthPercent}%;background:var(--chart-mark)`,
  });
  const mark = h(
    "div",
    {
      class: "chart-hit group relative flex min-w-0 flex-1 items-center gap-2 py-1 outline-none",
      tabindex: "0",
      role: "img",
      "aria-label": row.description,
    },
    h(
      "div",
      { class: "flex min-w-0 flex-1 items-center border-l border-border", "aria-hidden": "true" },
      bar,
      h(
        "span",
        { class: "ml-2 shrink-0 text-xs font-medium tabular-nums text-foreground" },
        row.valueText,
      ),
    ),
    h(
      "span",
      {
        class:
          "pointer-events-none absolute left-0 top-full z-10 mt-0.5 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus:block",
        "aria-hidden": "true",
      },
      row.tooltip,
    ),
  );
  return h(
    "div",
    { class: "flex items-center gap-3" },
    h(
      "span",
      { class: "w-28 shrink-0 truncate text-right text-xs text-muted-foreground sm:w-36" },
      row.label,
    ),
    mark,
  );
}

/** A segmented control that picks one of several views of the same data. */
export function viewSwitcher<T extends string>(
  options: ReadonlyArray<{ id: T; label: string }>,
  current: T,
  groupLabel: string,
  onChoose: (next: T) => void,
): HTMLElement {
  return h(
    "div",
    { class: "mb-3 inline-flex rounded-lg border p-0.5", role: "group", "aria-label": groupLabel },
    ...options.map((option) => {
      const button = h(
        "button",
        {
          type: "button",
          "data-view": option.id,
          "aria-pressed": String(option.id === current),
          class:
            "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary-text focus-visible:outline-2 focus-visible:outline-primary",
        },
        option.label,
      );
      button.addEventListener("click", () => onChoose(option.id));
      return button;
    }),
  );
}
