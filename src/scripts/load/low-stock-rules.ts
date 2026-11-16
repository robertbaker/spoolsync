import {
  SOURCE_LABELS,
  allSpools,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import {
  lowStockNameKey,
  lowStockSpoolKey,
  type LowStockOverrides,
} from "@spoolsync/core/core/stock";

import { saveLowStockOverrides, loadLowStockPolicy } from "~/lib/low-stock";

import { h } from "../dom";

const PERCENTAGES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90] as const;
type Scope = "brands" | "materials" | "spools";

const SCOPE_LABEL: Record<Scope, string> = {
  brands: "Brand",
  materials: "Material",
  spools: "Spool",
};

const select = (label: string, options: readonly [string, string][]) => {
  const element = h(
    "select",
    { class: "field-input mt-0 min-w-32 py-1 text-xs", "aria-label": label },
    ...options.map(([value, text]) => h("option", { value }, text)),
  );
  return element;
};

const button = (text: string, action: () => void, disabled = false) => {
  const element = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
    },
    text,
  ) as HTMLButtonElement;
  element.disabled = disabled;
  element.addEventListener("click", action);
  return element;
};

function normalizedNames(spools: readonly CommonSpool[], field: "vendor" | "material") {
  const names = new Map<string, string>();
  for (const spool of spools) {
    const display = spool[field]?.replace(/\s+/g, " ").trim();
    const key = lowStockNameKey(display);
    if (key && display && !names.has(key)) names.set(key, display);
  }
  return [...names].sort((a, b) => a[1].localeCompare(b[1]));
}

function spoolLabel(spool: CommonSpool): string {
  const description = [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ");
  return `${SOURCE_LABELS[spool.source]} · ${description || spool.sourceId} (${spool.sourceId})`;
}

function overrideLabel(scope: Scope, key: string, spools: readonly CommonSpool[]): string {
  if (scope === "brands")
    return spools.find((spool) => lowStockNameKey(spool.vendor) === key)?.vendor?.trim() ?? key;
  if (scope === "materials")
    return spools.find((spool) => lowStockNameKey(spool.material) === key)?.material?.trim() ?? key;
  const spool = spools.find((item) => lowStockSpoolKey(item) === key);
  return spool ? spoolLabel(spool) : key;
}

/** Adds an on-device editor for default-independent rules by brand, material, and spool. */
export function wireLowStockRules(
  toggle: HTMLButtonElement,
  panel: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  onChange: () => void,
): { update(): void } {
  const form = h("div", { class: "mt-3 flex flex-wrap items-end gap-2" });
  const rules = h("ul", { class: "mt-4 grid gap-2" });
  const message = h("p", { class: "mt-2 text-xs text-muted-foreground", role: "status" });
  const details = h(
    "section",
    { class: "mt-3 rounded-xl border p-4", "aria-labelledby": "low-stock-rules-heading" },
    h("h3", { id: "low-stock-rules-heading", class: "font-semibold" }, "Custom thresholds"),
    h(
      "p",
      { class: "mt-1 text-xs text-muted-foreground" },
      "A spool rule overrides its material rule, which overrides its brand rule, then the global threshold. A percentage also sets the fallback for spools without a full weight. These rules stay in this browser unless you include them in a settings export.",
    ),
    form,
    rules,
    message,
  );
  panel.replaceChildren(details);
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  function update(): void {
    const spools = allSpools(results.values());
    const brands = normalizedNames(spools, "vendor");
    const materials = normalizedNames(spools, "material");
    const scope = select("Rule scope", [
      ["brands", "By brand"],
      ["materials", "By material"],
      ["spools", "By spool"],
    ]) as HTMLSelectElement;
    const item = select("Brand, material, or spool", []) as HTMLSelectElement;
    const percent = select(
      "Low-stock percentage",
      PERCENTAGES.map((value) => [String(value), `${value}%`] as [string, string]),
    ) as HTMLSelectElement;
    const choices = (selectedScope: Scope): Array<[string, string]> => {
      if (selectedScope === "brands") return brands.map(([key, name]) => [key, name]);
      if (selectedScope === "materials") return materials.map(([key, name]) => [key, name]);
      return spools
        .toSorted((a, b) => spoolLabel(a).localeCompare(spoolLabel(b)))
        .map((spool) => [lowStockSpoolKey(spool), spoolLabel(spool)]);
    };
    const refreshItems = () => {
      const current = scope.value as Scope;
      const entries = choices(current);
      item.replaceChildren(...entries.map(([value, label]) => h("option", { value }, label)));
      item.disabled = entries.length === 0;
      add.disabled = item.disabled;
    };
    const add = button(
      "Add rule",
      () => {
        const current = loadLowStockPolicy().overrides;
        const next: LowStockOverrides = {
          brands: { ...current.brands },
          materials: { ...current.materials },
          spools: { ...current.spools },
        };
        next[scope.value as Scope][item.value] = Number(percent.value);
        if (!saveLowStockOverrides(next)) {
          message.textContent = "Could not save this rule in browser storage.";
          return;
        }
        message.textContent = "Threshold rule saved.";
        onChange();
      },
      true,
    );
    scope.addEventListener("change", refreshItems);
    refreshItems();
    form.replaceChildren(scope, item, percent, add);

    const overrides = loadLowStockPolicy().overrides;
    const entries = (Object.keys(SCOPE_LABEL) as Scope[]).flatMap((key) =>
      Object.entries(overrides[key]).map(([value, threshold]) => ({
        scope: key,
        key: value,
        threshold,
      })),
    );
    if (!entries.length) {
      rules.replaceChildren(
        h("li", { class: "text-sm text-muted-foreground" }, "No custom rules yet."),
      );
      return;
    }
    rules.replaceChildren(
      ...entries
        .toSorted((a, b) =>
          `${a.scope}:${overrideLabel(a.scope, a.key, spools)}`.localeCompare(
            `${b.scope}:${overrideLabel(b.scope, b.key, spools)}`,
          ),
        )
        .map(({ scope: currentScope, key, threshold }) => {
          const choice = select(`Threshold for ${overrideLabel(currentScope, key, spools)}`, [
            ["", "Use global"],
            ...PERCENTAGES.map((value) => [String(value), `${value}%`] as [string, string]),
          ]) as HTMLSelectElement;
          if (![...choice.options].some((option) => option.value === String(threshold)))
            choice.add(new Option(`${threshold}%`, String(threshold)));
          choice.value = String(threshold);
          choice.addEventListener("change", () => {
            const next: LowStockOverrides = {
              brands: { ...overrides.brands },
              materials: { ...overrides.materials },
              spools: { ...overrides.spools },
            };
            if (choice.value) next[currentScope][key] = Number(choice.value);
            else delete next[currentScope][key];
            if (!saveLowStockOverrides(next)) {
              message.textContent = "Could not save this rule in browser storage.";
              choice.value = String(threshold);
              return;
            }
            message.textContent = choice.value ? "Threshold rule updated." : "Custom rule removed.";
            onChange();
          });
          return h(
            "li",
            { class: "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2" },
            h(
              "span",
              { class: "min-w-0 flex-1 text-sm" },
              h(
                "span",
                { class: "text-xs text-muted-foreground" },
                `${SCOPE_LABEL[currentScope]} · `,
              ),
              overrideLabel(currentScope, key, spools),
            ),
            choice,
          );
        }),
    );
  }

  return { update };
}
