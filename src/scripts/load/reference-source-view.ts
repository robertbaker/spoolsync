import {
  GENERIC_FIELD_ALIASES,
  PROVIDERS,
  providerById,
  type ReferenceProviderId,
} from "@spoolsync/core/core/reference";

import { h, setChildren } from "../dom";
import { plural } from "./presentation";
import type { PanelContext } from "./reference-context";
import { fetchedText, remoteSource } from "./reference-remote-source";
import {
  PAGE,
  BADGE,
  BUTTON,
  INPUT,
  buyLinks,
  dryingText,
  recordFacts,
  referenceImage,
  swatch,
} from "./reference-widgets";

function fileSource(ctx: PanelContext): HTMLElement {
  const input = h("input", {
    id: "reference-file",
    type: "file",
    accept: ".json,.csv,.txt,application/json,text/csv",
    class:
      "block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-xs",
    "data-key": "reference-file",
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const info = ctx.controller.loadFile(file.name, text);
        ctx.state.sourceMessage = {
          tone: info.warnings.length || info.skipped ? "warning" : "info",
          text: `Read ${plural(info.usable, "filament")} from ${file.name}${info.skipped ? `; ${plural(info.skipped, "record")} could not be used` : ""}.`,
        };
        ctx.state.limit = PAGE;
        ctx.refreshSummary();
        ctx.draw();
      })
      .catch((error: unknown) => {
        ctx.state.sourceMessage = {
          tone: "error",
          text: error instanceof Error ? error.message : String(error),
        };
        ctx.draw();
      });
  });
  return h(
    "div",
    { class: "mt-3 grid gap-3" },
    h(
      "label",
      { for: "reference-file", class: "grid gap-1 text-sm font-medium" },
      "Reference file (JSON or CSV)",
      input,
    ),
    h(
      "details",
      { class: "rounded-lg border text-xs" },
      h(
        "summary",
        {
          class:
            "cursor-pointer p-2 font-medium focus-visible:outline-2 focus-visible:outline-primary",
        },
        "File format",
      ),
      h(
        "div",
        { class: "grid gap-2 px-3 pb-3 text-muted-foreground" },
        h(
          "p",
          {},
          "A JSON list of records (or an object holding one list, optionally with attribution and license text), or a CSV with a header row. Names are matched ignoring case, spacing and punctuation. Every record needs a brand (or a barcode) and at least a color, name or material.",
        ),
        h(
          "ul",
          { class: "grid gap-1" },
          ...(
            [
              ["Brand", "vendor"],
              ["Product line", "name"],
              ["Material", "material"],
              ["Color name", "colorName"],
              ["Color (hex)", "colorHex"],
              ["Diameter", "diameter"],
              ["Density", "density"],
              ["Nozzle temperature", "nozzleTempMin"],
              ["Bed temperature", "bedTempMin"],
              ["Net weight", "initialWeight"],
              ["Empty spool weight", "emptySpoolWeight"],
              ["Price", "price"],
              ["Barcode", "barcode"],
            ] as const
          ).map(([label, key]) =>
            h(
              "li",
              {},
              h("span", { class: "font-medium text-foreground" }, `${label}: `),
              GENERIC_FIELD_ALIASES[key].slice(0, 5).join(", "),
            ),
          ),
        ),
        h(
          "p",
          {},
          "Temperatures can also be a range (nozzle_temp 190-220). Weights of 10 or less are read as kilograms. The reference file stays in this tab; nothing is uploaded.",
        ),
      ),
    ),
  );
}

export function sourceSection(ctx: PanelContext): HTMLElement {
  const select = h("select", { id: "reference-provider", class: `${INPUT} w-auto` });
  for (const provider of PROVIDERS) {
    const option = h("option", { value: provider.info.id }, provider.info.label);
    option.selected = provider.info.id === ctx.controller.settings.providerId;
    select.append(option);
  }
  select.addEventListener("change", () => {
    ctx.controller.setProvider(select.value as ReferenceProviderId);
    ctx.state.settingsErrors = [];
    ctx.state.sourceMessage = null;
    ctx.draw();
    ctx.focusKey("reference-provider");
  });
  select.setAttribute("data-key", "reference-provider");
  const id = ctx.controller.settings.providerId;
  return h(
    "section",
    { class: "mt-4" },
    h("h4", { class: "text-sm font-semibold" }, "Source"),
    h(
      "div",
      { class: "mt-2 flex flex-wrap items-center gap-2 text-sm" },
      h(
        "label",
        { for: "reference-provider", class: "text-xs text-muted-foreground" },
        "Reference data from",
      ),
      select,
      providerById(id)?.info.status === "needs-endpoint-config"
        ? h(
            "span",
            { class: `rounded-full border px-2 py-0.5 text-xs ${BADGE.review}` },
            "Needs endpoint configuration",
          )
        : null,
    ),
    id === "file" ? fileSource(ctx) : remoteSource(ctx, id),
    h(
      "p",
      {
        id: "reference-source-message",
        class: `mt-3 text-sm ${ctx.state.sourceMessage?.tone === "error" ? "text-error-text" : ctx.state.sourceMessage?.tone === "warning" ? "text-warning-text" : "text-muted-foreground"}`,
        role: ctx.state.sourceMessage?.tone === "error" ? "alert" : "status",
        "aria-live": "polite",
      },
      ctx.state.sourceMessage?.text ?? "",
    ),
  );
}

/** Finds the records that carry a barcode, so a spool can be identified from its label. */
function barcodeLookup(ctx: PanelContext): HTMLElement | null {
  const catalog = ctx.controller.catalog;
  if (!catalog) return null;
  const input = h("input", {
    id: "reference-barcode",
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    class: INPUT,
    placeholder: "Barcode digits (UPC / EAN)",
    "aria-label": "Barcode to look up",
  });
  input.value = ctx.state.barcodeQuery;
  const result = h("div", {
    id: "reference-barcode-result",
    class: "mt-2 grid gap-2",
    role: "status",
    "aria-live": "polite",
  });
  const search = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "lookup-barcode" },
    "Look up",
  );
  const show = () => {
    ctx.state.barcodeQuery = input.value;
    const digits = ctx.state.barcodeQuery.replace(/\D/g, "");
    if (!digits) {
      result.replaceChildren();
      return;
    }
    const found = catalog.lookupBarcode(digits);
    if (!found.length) {
      result.replaceChildren(
        h(
          "p",
          { class: "text-xs text-muted-foreground" },
          digits.length < 6
            ? "Enter at least 6 digits."
            : `No record in this catalog has the barcode ${digits}.`,
        ),
      );
      return;
    }
    setChildren(
      result,
      ...found.slice(0, 10).map((reference) =>
        h(
          "div",
          {
            class: "flex items-start gap-2 rounded-md border p-2 text-xs",
            "data-record": reference.id,
          },
          referenceImage(reference, reference.colorName ?? reference.id),
          swatch(reference.colorHex),
          h(
            "div",
            { class: "min-w-0" },
            h(
              "p",
              { class: "font-medium text-foreground" },
              [reference.vendor, reference.material, reference.name, reference.colorName]
                .filter(Boolean)
                .join(" ") || reference.id,
            ),
            h(
              "p",
              { class: "text-muted-foreground" },
              recordFacts(reference) || "No further details.",
            ),
            dryingText(reference)
              ? h("p", { class: "text-muted-foreground" }, dryingText(reference))
              : null,
            buyLinks(reference),
            reference.sourceUrl
              ? h(
                  "a",
                  {
                    href: reference.sourceUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    class: "text-primary-text underline underline-offset-2 hover:no-underline",
                  },
                  `View on ${reference.providerLabel}`,
                )
              : null,
          ),
        ),
      ),
      found.length > 10
        ? h(
            "p",
            { class: "text-xs text-muted-foreground" },
            `${found.length - 10} more records have this barcode.`,
          )
        : null,
    );
  };
  search.addEventListener("click", show);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      show();
    }
  });
  show();
  return h(
    "div",
    { class: "mt-3" },
    h("label", { for: "reference-barcode", class: "text-xs font-medium" }, "Look up a barcode"),
    h("div", { class: "mt-1 flex gap-2" }, input, search),
    result,
  );
}

export function catalogSection(ctx: PanelContext): HTMLElement | null {
  const info = ctx.controller.info;
  if (!info) return null;
  const unload = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "unload-reference" },
    "Unload catalog",
  );
  unload.addEventListener("click", () => {
    ctx.controller.unload();
    ctx.state.sourceMessage = null;
    ctx.refreshSummary();
    ctx.draw();
  });
  const recheck = h(
    "button",
    { type: "button", class: BUTTON, "data-key": "check-updates" },
    "Check for updates",
  );
  recheck.hidden = info.origin === "file";
  recheck.disabled = ctx.controller.busy;
  recheck.addEventListener("click", async () => {
    ctx.state.sourceMessage = { tone: "info", text: "Checking for updates\u2026" };
    ctx.draw();
    const outcome = await ctx.controller.fetchProvider(info.providerId, { check: true });
    if (outcome.kind === "stale") return;
    ctx.state.sourceMessage =
      outcome.kind === "ok"
        ? { tone: "info", text: outcome.info.note ?? fetchedText(outcome.info) }
        : outcome.kind === "invalid"
          ? { tone: "error", text: outcome.errors.join(" ") }
          : { tone: "error", text: outcome.message };
    ctx.draw();
  });
  return h(
    "section",
    { class: "mt-4 rounded-lg border p-3 text-sm" },
    h(
      "p",
      { class: "font-medium" },
      `${info.providerLabel}: ${plural(info.usable, "filament")} from ${info.name}`,
      info.origin === "cache"
        ? " (saved copy)"
        : info.origin === "snapshot"
          ? " (built-in copy)"
          : "",
    ),
    h(
      "p",
      { class: "mt-1 text-xs text-muted-foreground" },
      `Credit: ${info.attribution}.`,
      info.license
        ? ` License: ${info.license}.`
        : " License: not stated by the source; check its terms before sharing this data.",
    ),
    info.origin !== "file"
      ? h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `Data as of ${new Date(info.loadedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`,
          info.note ? ` ${info.note}` : "",
        )
      : null,
    info.skipped
      ? h(
          "p",
          { class: "mt-1 text-xs text-muted-foreground" },
          `${plural(info.skipped, "record")} could not be used.`,
        )
      : null,
    info.warnings.length
      ? h(
          "details",
          { class: "mt-2 text-xs" },
          h(
            "summary",
            { class: "cursor-pointer focus-visible:outline-2 focus-visible:outline-primary" },
            `Notes about the file (${info.warnings.length})`,
          ),
          h(
            "ul",
            { class: "mt-1 list-disc pl-5 text-muted-foreground" },
            ...info.warnings.slice(0, 50).map((warning) => h("li", {}, warning)),
          ),
        )
      : null,
    barcodeLookup(ctx),
    h("div", { class: "mt-2 flex flex-wrap gap-2" }, recheck, unload),
  );
}
