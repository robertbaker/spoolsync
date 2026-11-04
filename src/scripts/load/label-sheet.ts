import type { CommonSpool, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { uniqueSpools } from "@spoolsync/core/workflow";

import { loadMatchDecisions } from "~/lib/browser/storage";
import { local, read, write } from "~/lib/browser/storage/access";
import {
  DEFAULT_LABEL_PRESET,
  LABEL_PRESETS,
  LABEL_SELECTIONS,
  buildLabel,
  labelPreset,
  labelsPerPage,
  qrPayload,
  selectLabelSpools,
  type Label,
  type LabelPreset,
  type LabelSelection,
} from "~/lib/labels/labels";
import { qrSvgPath, smallestVersion } from "~/lib/labels/qr";
import { currentLowStockRule } from "~/lib/low-stock";

import { h } from "../dom";
import { plural } from "./presentation";

const OPTIONS_KEY = "spoolsync:label-options";
const SVG_NS = "http://www.w3.org/2000/svg";
const PREVIEW_COUNT = 3;

interface Options {
  preset: string;
  selection: LabelSelection;
  /** Make one label per physical spool when records are linked across services. */
  oncePerSpool: boolean;
}

function readOptions(): Options {
  const defaults: Options = { preset: DEFAULT_LABEL_PRESET, selection: "all", oncePerSpool: true };
  try {
    const saved = JSON.parse(read(local, OPTIONS_KEY) ?? "{}") as Partial<Options>;
    return {
      preset: labelPreset(saved.preset).id,
      selection: LABEL_SELECTIONS.some((s) => s.id === saved.selection)
        ? (saved.selection as LabelSelection)
        : defaults.selection,
      oncePerSpool: saved.oncePerSpool !== false,
    };
  } catch {
    return defaults;
  }
}

function qrElement(label: Label): SVGElement | null {
  if (!label.qr) return null;
  const { path, viewBox } = qrSvgPath(label.qr);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${viewBox} ${viewBox}`);
  svg.setAttribute("class", "spool-label-qr");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `QR code for ${label.payload}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  shape.setAttribute("fill", "#000");
  svg.append(shape);
  return svg;
}

/** One printable label. Colors are fixed (black on white) so the code scans in either theme. */
export function labelElement(label: Label, preset: LabelPreset): HTMLElement {
  const swatch = h(
    "div",
    { class: "spool-label-swatch", "aria-hidden": "true" },
    ...(label.swatch.length ? label.swatch : ["FFFFFF"]).map((color) => {
      const band = h("span", {});
      band.style.backgroundColor = `#${color}`;
      return band;
    }),
  );
  const element = h(
    "article",
    {
      class: "spool-label",
      "aria-label": `Label for ${label.brand} ${label.material} ${label.color}`,
    },
    swatch,
    h(
      "div",
      { class: "spool-label-text" },
      h("p", { class: "spool-label-brand" }, label.brand),
      h("p", { class: "spool-label-line" }, `${label.material} · ${label.color}`),
      h("p", { class: "spool-label-weight" }, label.weight),
      h("p", { class: "spool-label-id" }, label.payload),
    ),
    qrElement(label),
  );
  element.style.setProperty("--label-w", `${preset.widthMm}mm`);
  element.style.setProperty("--label-h", `${preset.heightMm}mm`);
  element.style.setProperty("--label-qr", `${preset.qrMm}mm`);
  return element;
}

/** Prints a sheet of labels for the given spools in the given (or remembered) label size. */
export function printLabelSheet(spools: readonly CommonSpool[], presetId?: string): void {
  if (!spools.length) return;
  const preset = labelPreset(presetId ?? readOptions().preset);
  document.getElementById("label-sheet")?.remove();
  const sheet = h(
    "section",
    { id: "label-sheet", "aria-label": "Spool labels", "data-labels": String(spools.length) },
    ...spools.map((spool) => labelElement(buildLabel(spool), preset)),
  );
  document.body.append(sheet);
  document.body.classList.add("printing-labels");
  const finish = () => {
    document.body.classList.remove("printing-labels");
    sheet.remove();
  };
  window.addEventListener("afterprint", finish, { once: true });
  window.print();
}

interface Inputs {
  results: ReadonlyMap<SourceId, LoadResult>;
  /** The spools the loaded-spools table is showing. */
  visibleSpools: () => readonly CommonSpool[];
}

/** The "Print labels" action: choose spools and a size, preview, then print a sheet of labels. */
export function wireLabelPrinting({ results, visibleSpools }: Inputs): { update(): void } {
  const trigger = document.getElementById("print-labels");
  let dialog: HTMLDialogElement | undefined;
  let options = readOptions();
  let summary: HTMLElement;
  let preview: HTMLElement;
  let printButton: HTMLButtonElement;

  const chosen = (): CommonSpool[] => {
    const loaded = [...results.values()];
    return selectLabelSpools(
      loaded.flatMap((result) => result.spools),
      {
        mode: options.selection,
        visible: visibleSpools(),
        rule: currentLowStockRule(),
        ...(options.oncePerSpool ? { linked: uniqueSpools(loaded, loadMatchDecisions()) } : {}),
      },
    );
  };

  function refresh(): void {
    const spools = chosen();
    const preset = labelPreset(options.preset);
    const pages = Math.ceil(spools.length / labelsPerPage(preset, { width: 210, height: 297 }));
    summary.textContent = spools.length
      ? `${plural(spools.length, "label")}, about ${plural(pages, "A4 or Letter page")} at ${preset.widthMm} × ${preset.heightMm} mm.`
      : "No spools match this selection.";
    printButton.disabled = spools.length === 0;
    const labels = spools.slice(0, PREVIEW_COUNT).map(buildLabel);
    preview.replaceChildren(
      ...labels.map((label) => labelElement(label, preset)),
      ...(spools.length > PREVIEW_COUNT
        ? [
            h(
              "p",
              { class: "text-xs text-muted-foreground" },
              `and ${spools.length - PREVIEW_COUNT} more`,
            ),
          ]
        : []),
    );
    const note = spools.some(
      (spool) => smallestVersion(new TextEncoder().encode(qrPayload(spool)).length) === null,
    );
    if (note)
      summary.append(" Some ids are too long for a QR code; those labels print without one.");
  }

  function save(): void {
    write(local, OPTIONS_KEY, JSON.stringify({ ...options }));
    refresh();
  }

  function print(): void {
    printLabelSheet(chosen(), options.preset);
  }

  function radioGroup(): HTMLElement {
    return h(
      "fieldset",
      { class: "mt-4" },
      h("legend", { class: "text-sm font-semibold" }, "Which spools"),
      ...LABEL_SELECTIONS.map((choice) => {
        const input = h("input", {
          type: "radio",
          name: "label-selection",
          value: choice.id,
          class: "accent-primary",
        });
        input.checked = options.selection === choice.id;
        input.addEventListener("change", () => {
          options = { ...options, selection: choice.id };
          save();
        });
        return h("label", { class: "mt-1.5 flex items-center gap-2 text-sm" }, input, choice.label);
      }),
    );
  }

  function build(): HTMLDialogElement {
    const select = h(
      "select",
      { id: "label-size", class: "field-input mt-1 w-full py-1.5 text-sm" },
      ...LABEL_PRESETS.map((preset) => {
        const option = h("option", { value: preset.id }, preset.label);
        option.selected = preset.id === options.preset;
        return option;
      }),
    );
    select.addEventListener("change", () => {
      options = { ...options, preset: select.value };
      save();
    });
    const once = h("input", { type: "checkbox", id: "label-once", class: "accent-primary" });
    once.checked = options.oncePerSpool;
    once.addEventListener("change", () => {
      options = { ...options, oncePerSpool: once.checked };
      save();
    });
    summary = h("p", { class: "mt-4 text-sm", role: "status", id: "label-summary" });
    preview = h("div", { class: "label-preview mt-3 flex flex-wrap gap-3", id: "label-preview" });
    printButton = h(
      "button",
      {
        type: "button",
        id: "label-print",
        class:
          "rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      },
      "Print labels",
    );
    printButton.addEventListener("click", print);
    const close = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
      },
      "Close",
    );
    close.addEventListener("click", () => dialog?.close());
    const element = h(
      "dialog",
      {
        id: "labels-dialog",
        closedby: "any",
        class:
          "m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
        "aria-labelledby": "labels-title",
      },
      h(
        "div",
        { class: "p-6" },
        h("h2", { id: "labels-title", class: "text-xl font-bold tracking-tight" }, "Print labels"),
        h(
          "p",
          { class: "mt-1 text-sm text-muted-foreground" },
          "A sheet of spool labels with a color swatch, brand, material, color, weight left, and a QR code holding the service and spool id (for example spoolman:12). Nothing else is encoded, and nothing is uploaded. To find a spool from its label, scan it with a barcode scanner that types, or paste the code, into the filter box and press Enter.",
        ),
        radioGroup(),
        h(
          "div",
          { class: "mt-4" },
          h("label", { for: "label-size", class: "text-sm font-semibold" }, "Label size"),
          select,
        ),
        h(
          "label",
          { class: "mt-4 flex items-center gap-2 text-sm", for: "label-once" },
          once,
          "One label per spool when it is listed in several services",
        ),
        summary,
        preview,
        h("div", { class: "mt-5 flex flex-wrap justify-end gap-3" }, close, printButton),
      ),
    );
    element.addEventListener("click", (event) => {
      if (event.target === element) element.close();
    });
    document.body.append(element);
    return element;
  }

  trigger?.addEventListener("click", () => {
    dialog ??= build();
    refresh();
    if (!dialog.open) dialog.showModal();
  });

  return {
    update() {
      if (trigger) trigger.hidden = results.size === 0;
      if (dialog?.open) refresh();
    },
  };
}
