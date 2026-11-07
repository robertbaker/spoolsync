import { FIELD_LABELS } from "@spoolsync/core/core/compare";
import { REFERENCE_FIELDS, type ReferenceField } from "@spoolsync/core/core/reference";

import { h } from "../dom";
import type { PanelContext } from "./reference-context";
import { PAGE } from "./reference-widgets";

export function policySection(ctx: PanelContext): HTMLElement {
  const policy = ctx.controller.policy;
  const rows = REFERENCE_FIELDS.map((field) => {
    const use = h("input", { type: "checkbox", class: "size-4", "data-key": `use-${field}` });
    use.checked = policy.fields.includes(field);
    const over = h("input", { type: "checkbox", class: "size-4", "data-key": `over-${field}` });
    over.checked = policy.overwrite.includes(field);
    over.disabled = !use.checked;
    const apply = (fields: ReferenceField[], overwrite: ReferenceField[]) => {
      const key = document.activeElement?.getAttribute("data-key");
      ctx.controller.setPolicy({
        fields: REFERENCE_FIELDS.filter((candidate) => fields.includes(candidate)),
        overwrite: REFERENCE_FIELDS.filter(
          (candidate) => overwrite.includes(candidate) && fields.includes(candidate),
        ),
      });
      ctx.state.limit = PAGE;
      ctx.draw();
      ctx.focusKey(key);
      ctx.refreshSummary();
    };
    use.addEventListener("change", () =>
      apply(use.checked ? [...policy.fields, field] : policy.fields.filter((f) => f !== field), [
        ...policy.overwrite,
      ]),
    );
    over.addEventListener("change", () =>
      apply(
        [...policy.fields],
        over.checked ? [...policy.overwrite, field] : policy.overwrite.filter((f) => f !== field),
      ),
    );
    use.setAttribute("aria-label", `Use the reference for ${FIELD_LABELS[field]}`);
    over.setAttribute("aria-label", `Allow the reference to overwrite ${FIELD_LABELS[field]}`);
    return h(
      "li",
      { class: "flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-xs" },
      h("span", { class: "font-medium text-foreground" }, FIELD_LABELS[field]),
      h(
        "span",
        { class: "flex items-center gap-3 text-muted-foreground" },
        h("label", { class: "flex items-center gap-1" }, use, "Use"),
        h("label", { class: "flex items-center gap-1" }, over, "Overwrite"),
      ),
    );
  });
  return h(
    "details",
    { class: "mt-4 rounded-lg border" },
    h(
      "summary",
      {
        class:
          "cursor-pointer p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary",
      },
      `Fields (${policy.fields.length} used, ${policy.overwrite.length} may overwrite)`,
    ),
    h(
      "div",
      { class: "px-3 pb-3" },
      h(
        "p",
        { class: "text-xs text-muted-foreground" },
        "By default the reference only fills in values you are missing. Turn on Overwrite for a field to also be offered corrections where your value differs; you still accept each one. The brand is how spools are matched and the price is what you paid, so both are off.",
      ),
      h("ul", { class: "mt-2 grid gap-1.5 sm:grid-cols-2" }, ...rows),
    ),
  );
}
