import type { ReferenceFilament } from "@spoolsync/core/core/reference";

import { h } from "../dom";
import { BUTTON, PRESSED, spoolLabel } from "./panel-ui";

export { BUTTON, PRESSED, spoolLabel };

/** Cards drawn at once; "Show more" draws the next batch. */
export const PAGE = 25;

export const BADGE = {
  safe: "border-success/40 bg-success/10 text-success-text",
  review: "border-warning/40 bg-warning/10",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;
export const VERDICT = {
  match: "Matches",
  close: "Close",
  mismatch: "Does not match",
} as const;

/** A small color chip; the color is set through the style object, which a strict CSP allows. */
export function swatch(hex: string | null | undefined): HTMLElement {
  const chip = h("span", {
    class: "filament-swatch inline-block size-5 shrink-0 rounded-full border",
    "aria-hidden": "true",
  });
  if (hex) chip.style.backgroundColor = `#${hex}`;
  return chip;
}

export const number = (value: number) => value.toLocaleString("en", { maximumFractionDigits: 2 });

/** One-line facts about a reference record, for the barcode lookup and the match card. */
export function recordFacts(reference: ReferenceFilament): string {
  const range = (low: number | null, high: number | null, unit: string) =>
    low !== null && high !== null
      ? `${number(low)}\u2013${number(high)} ${unit}`
      : low !== null || high !== null
        ? `${number((low ?? high) as number)} ${unit}`
        : null;
  return [
    reference.diameter !== null ? `${number(reference.diameter)} mm` : null,
    reference.initialWeight !== null ? `${number(reference.initialWeight)} g` : null,
    range(reference.nozzleTempMin, reference.nozzleTempMax, "\u00b0C nozzle"),
    range(reference.bedTempMin, reference.bedTempMax, "\u00b0C bed"),
    reference.density !== null ? `${number(reference.density)} g/cm\u00b3` : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

/**
 * Drying advice, when the source gives it. SpoolSync keeps no drying field, so this is information
 * only.
 */
export function dryingText(reference: ReferenceFilament): string | null {
  if (reference.dryingTemp == null && reference.dryingHours == null) return null;
  return `Drying: ${[
    reference.dryingTemp != null ? `${number(reference.dryingTemp)} \u00b0C` : null,
    reference.dryingHours != null ? `${number(reference.dryingHours)} h` : null,
  ]
    .filter(Boolean)
    .join(" for ")}`;
}

/** The visitor's country from the browser language ("en-GB" is GB), or `null` when it says none. */
function visitorRegion(): string | null {
  const region = /^[a-z]{2,3}-([A-Za-z]{2})\b/.exec(navigator.language ?? "")?.[1];
  return region ? region.toUpperCase() : null;
}

/**
 * Where a record can be bought: shops that list the visitor's country come first, and a shop that
 * lists other countries only is marked, since it may not deliver. Information only; the links go to
 * the shops' own pages.
 */
export function buyLinks(reference: ReferenceFilament): HTMLElement | null {
  const links = reference.buyLinks ?? [];
  if (!links.length) return null;
  const region = visitorRegion();
  const ships = (link: (typeof links)[number]) =>
    region && link.shipsTo.length ? link.shipsTo.includes(region) : null;
  const ordered = links.toSorted((x, y) => Number(ships(y) === true) - Number(ships(x) === true));
  const nodes: Array<Node | string> = ["Where to buy: "];
  ordered.slice(0, 3).forEach((link, index) => {
    if (index) nodes.push(", ");
    nodes.push(
      h(
        "a",
        {
          href: link.url,
          target: "_blank",
          rel: "noopener noreferrer",
          class: "text-primary-text underline underline-offset-2 hover:no-underline",
        },
        link.store,
      ),
    );
    if (ships(link) === false) nodes.push(` (does not list ${region})`);
  });
  return h("p", { class: "text-xs text-muted-foreground" }, ...nodes);
}

/**
 * The photo or swatch image a source supplies. It is loaded from the source's own host, without a
 * referrer.
 */
export function referenceImage(reference: ReferenceFilament, label: string): HTMLElement | null {
  if (!reference.imageUrl) return null;
  return h("img", {
    src: reference.imageUrl,
    alt: `Photo of ${label}`,
    width: "40",
    height: "40",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    class: "size-10 shrink-0 rounded border object-cover",
  });
}

export function colorChips(colors: readonly string[]): HTMLElement {
  return h(
    "span",
    { class: "inline-flex flex-wrap items-center gap-1" },
    ...colors.map((hex) =>
      h("span", { class: "inline-flex items-center gap-1 text-xs" }, swatch(hex), `#${hex}`),
    ),
    colors.length ? null : h("span", { class: "text-xs text-muted-foreground" }, "(empty)"),
  );
}

export function labelled(label: string, id: string, control: HTMLElement): HTMLElement {
  return h("label", { for: id, class: "grid gap-1 text-xs text-muted-foreground" }, label, control);
}

export const INPUT = "field-input mt-0 w-full py-1 text-xs";

export function textInput(id: string, value: string, placeholder = ""): HTMLInputElement {
  const input = h("input", {
    id,
    type: "text",
    class: INPUT,
    autocomplete: "off",
    spellcheck: "false",
  });
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

export function numberInput(
  id: string,
  value: number | null,
  min: number,
  max: number,
): HTMLInputElement {
  const input = h("input", {
    id,
    type: "number",
    class: INPUT,
    min: String(min),
    max: String(max),
    step: "1",
  });
  if (value !== null) input.value = String(value);
  return input;
}
