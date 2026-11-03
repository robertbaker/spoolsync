import {
  CURRENCIES,
  readDisplaySettings,
  updateDisplaySettings,
  type CurrencyCode,
  type WeightUnit,
} from "~/lib/units";

import { h } from "./dom";

const SELECT_CLASS = "field-input mt-1 w-full py-1.5 text-sm";

function currencyLabel(code: CurrencyCode): string {
  return code === "" ? "None (show numbers as stored)" : code;
}

/**
 * Weight unit and price symbol controls for the Saved settings dialog. Changes apply at once and
 * charts re-render from the `DISPLAY_CHANGED` event. Prices are never converted: the currency is
 * only the symbol shown next to the stored number, and the label says so.
 */
export function displaySettingsSection(): HTMLElement {
  const current = readDisplaySettings();

  const unit = h(
    "select",
    { id: "display-weight-unit", class: SELECT_CLASS },
    h("option", { value: "g" }, "Grams (g)"),
    h("option", { value: "oz" }, "Ounces (oz)"),
  );
  unit.value = current.weightUnit;
  unit.addEventListener("change", () =>
    updateDisplaySettings({ weightUnit: unit.value as WeightUnit }),
  );

  const currency = h(
    "select",
    { id: "display-currency", class: SELECT_CLASS, "aria-describedby": "display-currency-hint" },
    ...CURRENCIES.map((code) => h("option", { value: code }, currencyLabel(code))),
  );
  currency.value = current.currency;
  currency.addEventListener("change", () =>
    updateDisplaySettings({ currency: currency.value as CurrencyCode }),
  );

  return h(
    "div",
    { class: "mt-4 border-t pt-3", id: "display-settings" },
    h("p", { class: "text-sm font-semibold" }, "Display"),
    h(
      "p",
      { class: "text-xs text-muted-foreground" },
      "Changes how weights and prices are shown on the Load page. Your files and exports are never changed.",
    ),
    h(
      "div",
      { class: "mt-2 grid gap-3 sm:grid-cols-2" },
      h(
        "label",
        { class: "block text-xs font-medium", for: "display-weight-unit" },
        "Weight unit",
        unit,
      ),
      h(
        "label",
        { class: "block text-xs font-medium", for: "display-currency" },
        "Price display symbol",
        currency,
        h(
          "span",
          { id: "display-currency-hint", class: "mt-1 block font-normal text-muted-foreground" },
          "Only the symbol changes. Prices stay in each service's own currency and are not converted.",
        ),
      ),
    ),
  );
}
