import type { LoadResult } from "@spoolsync/core/core/model";

import { h, notice } from "../dom";

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function badge(text: string, tone: "success" | "neutral"): HTMLElement {
  const color =
    tone === "success" ? "bg-success/15 text-success-text" : "bg-muted text-muted-foreground";
  return h(
    "span",
    {
      class: `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${color}`,
    },
    h("span", {
      class: `size-1.5 rounded-full ${tone === "success" ? "bg-success" : "bg-muted-foreground/60"}`,
      "aria-hidden": "true",
    }),
    text,
  );
}

export function warningsNotice(result: LoadResult): HTMLElement | null {
  if (!result.warnings.length) return null;
  return notice(
    "warning",
    `${result.warnings.length} note${result.warnings.length === 1 ? "" : "s"}`,
    h(
      "ul",
      { class: "mt-1 list-disc pl-5" },
      ...result.warnings.slice(0, 20).map((w) => h("li", {}, w)),
    ),
  );
}
