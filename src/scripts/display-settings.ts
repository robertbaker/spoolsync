import { LOCALES, LOCALE_NAMES, getLocale, setLocale, t, type Locale } from "~/lib/i18n";
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
  return code === "" ? t("display.currency.none") : code;
}

/**
 * Language, weight unit and price symbol controls for the Saved settings dialog. Changes apply at
 * once: charts re-render from the `DISPLAY_CHANGED` event and panels from `LOCALE_CHANGED`. Prices
 * are never converted: the currency is only the symbol shown next to the stored number, and the
 * label says so. Language names are written in their own language so they can always be found.
 */
export function displaySettingsSection(): HTMLElement {
  const current = readDisplaySettings();

  const language = h(
    "select",
    { id: "display-language", class: SELECT_CLASS, "aria-describedby": "display-language-hint" },
    ...LOCALES.map((locale) => {
      const option = h("option", { value: locale, lang: locale }, LOCALE_NAMES[locale]);
      return option;
    }),
  );
  language.value = getLocale();
  language.addEventListener("change", () => setLocale(language.value as Locale));

  const unit = h(
    "select",
    { id: "display-weight-unit", class: SELECT_CLASS },
    h("option", { value: "g" }, t("display.unit.g")),
    h("option", { value: "oz" }, t("display.unit.oz")),
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
    h("p", { class: "text-sm font-semibold" }, t("display.title")),
    h("p", { class: "text-xs text-muted-foreground" }, t("display.hint")),
    h(
      "div",
      { class: "mt-2 grid gap-3 sm:grid-cols-2" },
      h(
        "label",
        { class: "block text-xs font-medium", for: "display-language" },
        t("lang.label"),
        language,
        h(
          "span",
          { id: "display-language-hint", class: "mt-1 block font-normal text-muted-foreground" },
          t("lang.hint"),
        ),
      ),
      h(
        "label",
        { class: "block text-xs font-medium", for: "display-weight-unit" },
        t("display.weightUnit"),
        unit,
      ),
      h(
        "label",
        { class: "block text-xs font-medium", for: "display-currency" },
        t("display.currency"),
        currency,
        h(
          "span",
          { id: "display-currency-hint", class: "mt-1 block font-normal text-muted-foreground" },
          t("display.currency.hint"),
        ),
      ),
    ),
  );
}
