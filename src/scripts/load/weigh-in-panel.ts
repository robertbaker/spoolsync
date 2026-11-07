import { stageBulkEdit } from "~/lib/browser/storage/bulk-edits";
import type { SpoolDetail } from "~/lib/spool-detail";
import { formatWeight, gramsToUnit, readDisplaySettings, type WeightUnit } from "~/lib/units";
import {
  NO_BRAND_KEY,
  brandKey,
  forgetTare,
  knownTare,
  parseScaleInput,
  readTares,
  resolveTare,
  saveTare,
  weighIn,
} from "~/lib/weigh-in";

import { h, showToast } from "../dom";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

/** What was typed, kept per spool so a redraw of the drawer does not wipe the boxes. */
export type WeighInMemory = Map<string, { gross: string; tare: string; unit?: WeightUnit }>;

/** A weight as the visitor would type it: in the display unit, no unit suffix, no grouping. */
function inputValue(grams: number, unit: WeightUnit): string {
  const value = gramsToUnit(grams, unit);
  return String(Math.round(value * (unit === "oz" ? 100 : 10)) / (unit === "oz" ? 100 : 10));
}

function convertRemembered(raw: string, fromUnit: WeightUnit, toUnit: WeightUnit): string {
  if (fromUnit === toUnit || raw.trim() === "") return raw;
  const grams = parseScaleInput(raw, fromUnit);
  return typeof grams === "number" ? inputValue(grams, toUnit) : raw;
}

/**
 * The "Weigh in" section of the spool drawer: type what the scale shows with the spool on it, and
 * the empty spool's weight is subtracted to give the filament left. The result can be staged as a
 * bulk edit, which the Sync page then shows in its plan; nothing is written to a service from
 * here.
 */
export function createWeighInSection(detail: SpoolDetail, memory: WeighInMemory): HTMLElement {
  const unit = readDisplaySettings().weightUnit;
  const { spool } = detail;
  const brand = spool.vendor?.trim() || null;
  const brandLabel = brand ?? "spools without a brand";
  const recordedEmpty =
    detail.columns
      .map((column) => column.emptySpoolWeight)
      .find((value) => value !== null && value > 0) ?? null;
  const initial =
    detail.columns
      .map((column) => column.initialWeight)
      .find((value) => value !== null && value > 0) ?? null;
  const current = spool.remainingWeight;
  const suggestion = () =>
    resolveTare({ vendor: brand, recorded: recordedEmpty, saved: readTares() });
  const remembered = memory.get(detail.key);
  const start = suggestion();

  const gross = h("input", {
    id: "weigh-in-gross",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    class: "field-input mt-1 w-32 tabular-nums",
    "aria-describedby": "weigh-in-result",
  });
  const tare = h("input", {
    id: "weigh-in-tare",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    class: "field-input mt-1 w-32 tabular-nums",
    "aria-describedby": "weigh-in-tare-note",
  });
  const rememberedUnit = remembered?.unit ?? unit;
  gross.value = remembered ? convertRemembered(remembered.gross, rememberedUnit, unit) : "";
  tare.value = remembered
    ? convertRemembered(remembered.tare, rememberedUnit, unit)
    : start
      ? inputValue(start.grams, unit)
      : "";

  const tareNote = h("p", {
    id: "weigh-in-tare-note",
    class: "mt-1 text-xs text-muted-foreground",
  });
  const result = h("p", {
    id: "weigh-in-result",
    class: "mt-3 min-h-6 text-sm",
    role: "status",
    "aria-live": "polite",
  });
  const remember = h("button", { type: "button", class: BUTTON, "data-action": "remember-tare" });
  const forget = h(
    "button",
    { type: "button", class: BUTTON, "data-action": "forget-tare" },
    "Forget saved",
  );
  const stage = h(
    "button",
    { type: "button", class: `${BUTTON} text-foreground`, "data-action": "stage-weight" },
    "Stage as edit for Sync",
  );
  const outcome = h("p", { class: "mt-2 text-xs", role: "status", "aria-live": "polite" });

  /** The grams the form describes right now, or a message to show instead. */
  function reading() {
    const scale = parseScaleInput(gross.value, unit);
    const empty = parseScaleInput(tare.value, unit);
    gross.setAttribute("aria-invalid", String(scale === "invalid"));
    tare.setAttribute("aria-invalid", String(empty === "invalid"));
    if (scale === "invalid" || empty === "invalid")
      return { error: "Enter weights as plain numbers, from 0 up." } as const;
    return {
      calculation: weighIn({ gross: scale, tare: empty, initial, current }),
      empty,
    } as const;
  }

  let staged: number | null = null;

  function update(): void {
    memory.set(detail.key, { gross: gross.value, tare: tare.value, unit });
    const saved = readTares();
    const typedTare = parseScaleInput(tare.value, unit);
    const resolved = suggestion();
    const origin =
      typedTare === null || typedTare === "invalid"
        ? "Enter the weight of the empty spool."
        : resolved && Math.abs(resolved.grams - typedTare) < 0.05
          ? `From ${resolved.source}.`
          : "Your own value.";
    const typicalBrand = knownTare(brand);
    tareNote.textContent = `${origin} ${
      typicalBrand && !recordedEmpty
        ? "Typical spools vary, so weigh your own empty spool for the best result."
        : ""
    }`.trim();

    const canSave =
      typeof typedTare === "number" &&
      typedTare > 0 &&
      !(resolved?.origin === "custom" && Math.abs(resolved.grams - typedTare) < 0.05);
    remember.disabled = !canSave;
    remember.textContent = `Remember for ${brandLabel}`;
    forget.hidden = saved[brandKey(brand) || NO_BRAND_KEY] === undefined;

    const state = reading();
    outcome.textContent = "";
    if ("error" in state) {
      result.textContent = state.error ?? "";
      result.className = "mt-3 min-h-6 text-sm text-error-text";
      stage.disabled = true;
      staged = null;
      return;
    }
    const { calculation } = state;
    if (!calculation.ok) {
      const untouched = gross.value.trim() === "";
      result.textContent = untouched ? "" : calculation.error;
      result.className = `mt-3 min-h-6 text-sm ${untouched ? "" : "text-error-text"}`;
      stage.disabled = true;
      staged = null;
      return;
    }
    staged = calculation.remaining;
    const parts = [`${formatWeight(calculation.remaining, unit)} of filament left`];
    if (calculation.percent !== null)
      parts.push(`${calculation.percent}% of ${formatWeight(initial, unit)}`);
    let text = `${parts.join(" · ")}.`;
    if (calculation.delta !== null && current !== null)
      text +=
        calculation.delta === 0
          ? ` Matches what is recorded (${formatWeight(current, unit)}).`
          : ` That is ${formatWeight(Math.abs(calculation.delta), unit)} ${
              calculation.delta < 0 ? "less" : "more"
            } than the recorded ${formatWeight(current, unit)}.`;
    if (calculation.overFull)
      text += " This is above the full weight, so check the empty spool weight.";
    result.textContent = text;
    result.className = `mt-3 min-h-6 text-sm font-medium ${calculation.overFull ? "text-warning-text" : ""}`;
    stage.disabled = !detail.canStageWeight || !detail.groupId;
  }

  for (const input of [gross, tare]) input.addEventListener("input", update);
  remember.addEventListener("click", () => {
    const empty = parseScaleInput(tare.value, unit);
    if (typeof empty !== "number" || !saveTare(brand, empty)) {
      showToast("Could not save the empty spool weight", "error");
      return;
    }
    showToast(`Saved ${formatWeight(empty, unit)} as the empty spool for ${brandLabel}`, "success");
    update();
  });
  forget.addEventListener("click", () => {
    forgetTare(brand);
    const next = suggestion();
    tare.value = next ? inputValue(next.grams, unit) : "";
    update();
  });
  stage.addEventListener("click", () => {
    if (staged === null || !detail.groupId) return;
    const edit = stageBulkEdit(detail.groupId, { remainingWeight: staged });
    if (!edit) {
      showToast("Could not stage the weight in this browser", "error");
      return;
    }
    outcome.replaceChildren(
      `Staged ${formatWeight(staged, unit)} as the remaining weight. `,
      h(
        "a",
        { href: "/sync", class: "font-medium text-primary-text underline underline-offset-2" },
        "Review it on the Sync page",
      ),
      ".",
    );
    showToast("Weight staged for the Sync page", "success");
  });

  update();
  return h(
    "div",
    { class: "mt-2 rounded-lg border p-3", "data-weigh-in": "" },
    h(
      "p",
      { class: "text-xs text-muted-foreground" },
      `Put the spool on a scale and enter the reading in ${unit === "oz" ? "ounces" : "grams"}. The empty spool is subtracted for you.`,
    ),
    h(
      "div",
      { class: "mt-2 flex flex-wrap items-end gap-4" },
      h("label", { class: "text-sm font-medium", for: "weigh-in-gross" }, "Scale reading", gross),
      h("label", { class: "text-sm font-medium", for: "weigh-in-tare" }, "Empty spool", tare),
    ),
    tareNote,
    h("div", { class: "mt-2 flex flex-wrap gap-2" }, remember, forget),
    result,
    h(
      "div",
      { class: "mt-2 flex flex-wrap items-center gap-2" },
      stage,
      detail.canStageWeight
        ? null
        : h(
            "span",
            { class: "text-xs text-muted-foreground" },
            "None of this spool's services can take a weight change from SpoolSync, so this is for reference.",
          ),
    ),
    outcome,
  );
}
