import { CLEANUP_RULES } from "@spoolsync/core/core/cleanup";

import { h } from "../dom";
import type { CleanupContext } from "./cleanup-context";
import { PAGE } from "./cleanup-list-view";

export function rulesSection(ctx: CleanupContext): HTMLElement {
  const enabled = new Set(ctx.controller.settings.enabled);
  return h(
    "fieldset",
    { class: "mt-3" },
    h("legend", { class: "text-sm font-medium" }, "Rules"),
    h(
      "div",
      { class: "mt-2 grid gap-2 sm:grid-cols-2" },
      ...CLEANUP_RULES.map((rule) => {
        const input = h("input", {
          type: "checkbox",
          class: "mt-0.5 size-4 shrink-0",
          "data-key": `rule-${rule.id}`,
        });
        input.checked = enabled.has(rule.id);
        input.addEventListener("change", () => {
          const key = `rule-${rule.id}`;
          ctx.controller.setRule(rule.id, input.checked);
          ctx.state.limit = PAGE;
          ctx.draw();
          ctx.focusKey(key);
          ctx.refreshSummary();
        });
        return h(
          "label",
          { class: "flex gap-2 rounded-lg border p-2 text-xs" },
          input,
          h(
            "span",
            {},
            h("span", { class: "block font-medium text-foreground" }, rule.label),
            h("span", { class: "block text-muted-foreground" }, rule.description),
          ),
        );
      }),
    ),
  );
}
