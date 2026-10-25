import {
  FIELD_LABELS,
  formatValue,
  type FieldComparison,
  type FieldValue,
  type GroupResolution,
} from "@spoolsync/core/core/compare";
import type { SpoolGroup } from "@spoolsync/core/core/match";
import { SOURCE_LABELS, type SourceId } from "@spoolsync/core/core/model";

import { h } from "../dom";
import { swatches } from "./presentation";

export function comparisonRow(
  group: SpoolGroup,
  comparison: FieldComparison,
  sources: SourceId[],
  resolution: GroupResolution,
  setValue: (
    group: SpoolGroup,
    field: FieldComparison["field"],
    value: FieldValue | undefined,
  ) => void,
): HTMLElement {
  const name = `${group.id}::${comparison.field}`;
  const chosen = resolution.values[comparison.field];
  const isChosen = (value: FieldValue) =>
    comparison.field in resolution.values &&
    formatValue(comparison.field, value) === formatValue(comparison.field, chosen ?? null);

  const cells = sources.map((source) => {
    const option = comparison.options.find((candidate) => candidate.sources.includes(source));
    if (!option) {
      const blank = comparison.blank.includes(source);
      return h(
        "td",
        { class: "px-3 py-2 text-muted-foreground" },
        blank ? "—" : h("span", { title: `${SOURCE_LABELS[source]} does not store this` }, "n/a"),
      );
    }
    const id = `${name}::${source}`;
    const input = h("input", { type: "radio", name, id, class: "size-4" });
    input.checked = isChosen(option.value);
    input.addEventListener("change", () => setValue(group, comparison.field, option.value));
    const label = h(
      "label",
      {
        for: id,
        class:
          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-colors has-[:checked]:bg-primary/10 has-[:checked]:font-semibold has-[:checked]:text-primary hover:bg-muted/60",
      },
      input,
    );
    if (comparison.field === "colors") label.append(swatches(option.value as string[]), " ");
    label.append(formatValue(comparison.field, option.value));
    return h("td", { class: "px-3 py-2" }, label);
  });

  const keepId = `${name}::keep`;
  const keep = h("input", { type: "radio", name, id: keepId, class: "size-4" });
  keep.checked = !(comparison.field in resolution.values);
  keep.addEventListener("change", () => setValue(group, comparison.field, undefined));

  return h(
    "tr",
    { class: `border-t ${comparison.kind === "conflict" ? "bg-warning/5" : ""}` },
    h(
      "th",
      { scope: "row", class: "px-3 py-2 text-left font-medium" },
      FIELD_LABELS[comparison.field],
      h(
        "span",
        { class: "ml-2 text-xs font-normal text-muted-foreground" },
        comparison.kind === "fill" ? "fill blank" : "differs",
      ),
    ),
    ...cells,
    h(
      "td",
      { class: "px-3 py-2" },
      h(
        "label",
        {
          for: keepId,
          class:
            "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-colors has-[:checked]:bg-muted has-[:checked]:font-medium hover:bg-muted/60",
        },
        keep,
        "Leave as is",
      ),
    ),
  );
}
