import type { CommonSpool } from "@spoolsync/core/core/model";
import { ColorIndex, type ReferenceCatalog } from "@spoolsync/core/core/reference";

import { t } from "~/lib/i18n";

import { h } from "../dom";
import type { ReferenceController } from "./reference-controller";

/** One index per catalog, so typing a color re-searches without re-reading 60,000 records. */
const indexes = new WeakMap<ReferenceCatalog, ColorIndex>();
function indexFor(catalog: ReferenceCatalog): ColorIndex {
  let index = indexes.get(catalog);
  if (!index) {
    index = new ColorIndex(catalog.entries);
    indexes.set(catalog, index);
  }
  return index;
}

const verdictText = (verdict: "match" | "close" | "mismatch") =>
  t(
    verdict === "match"
      ? "reference.colors.same"
      : verdict === "close"
        ? "reference.colors.close"
        : "reference.colors.different",
  );

const HEX = /^#?([0-9a-f]{6})$/i;

const swatch = (hex: string): HTMLElement =>
  h("span", {
    class: "inline-block size-4 rounded-sm border align-middle",
    style: `background-color:#${hex}`,
    "aria-hidden": "true",
  });

const label = (spool: CommonSpool) =>
  [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || `Spool ${spool.sourceId}`;

/**
 * "Find similar colors": the catalog colors nearest to a spool's color or to one typed in. It helps
 * with a spool no record matched by name, and with finding a stand-in for a color that is out of
 * stock. Results show how close each is by the difference the eye can tell (CIEDE2000).
 */
export function colorFinder(
  controller: ReferenceController,
  spools: ReadonlyMap<string, CommonSpool>,
): HTMLElement | null {
  const catalog = controller.catalog;
  if (!catalog) return null;
  const index = indexFor(catalog);
  if (!index.size) return null;

  const coloured = [...spools.entries()]
    .filter(([, spool]) => spool.colors.length === 1 && HEX.test(spool.colors[0]!))
    .slice(0, 500);

  const select = h(
    "select",
    { id: "color-finder-spool", class: "field-input mt-1 w-full text-xs" },
    h(
      "option",
      { value: "" },
      coloured.length ? t("reference.colors.choose") : t("reference.colors.noneColored"),
    ),
    ...coloured.map(([key, spool]) =>
      h("option", { value: key }, `${label(spool)} (#${spool.colors[0]})`),
    ),
  );
  const hexInput = h("input", {
    id: "color-finder-hex",
    type: "text",
    class: "field-input mt-1 w-full text-xs",
    placeholder: "#RRGGBB",
    maxlength: "7",
    autocomplete: "off",
    spellcheck: "false",
    "aria-describedby": "color-finder-status",
  });
  const sameMaterial = h("input", {
    id: "color-finder-material",
    type: "checkbox",
    class: "mr-2 align-middle",
  });
  const status = h("p", {
    id: "color-finder-status",
    class: "mt-2 min-h-5 text-xs text-muted-foreground",
    role: "status",
    "aria-live": "polite",
  });
  const results = h("ul", { class: "mt-2 grid gap-1 text-xs", "data-key": "color-results" });

  function search(): void {
    const match = HEX.exec(hexInput.value.trim());
    results.replaceChildren();
    if (!match) {
      status.textContent = hexInput.value.trim() ? t("reference.colors.invalid") : "";
      hexInput.toggleAttribute("aria-invalid", Boolean(hexInput.value.trim()));
      return;
    }
    hexInput.removeAttribute("aria-invalid");
    const spool = spools.get(select.value);
    const tied = spool
      ? controller.selectedFor(`${spool.source}:${spool.sourceId}`)?.reference
      : null;
    const found = index.nearest(match[1]!, {
      limit: 8,
      material: sameMaterial.checked ? (spool?.material ?? null) : null,
      excludeId: tied?.id ?? null,
    });
    status.textContent = found.length
      ? t("reference.colors.found", { count: found.length })
      : sameMaterial.checked && !spool?.material
        ? t("reference.colors.needMaterial")
        : t("reference.colors.none");
    for (const { reference, deltaE, verdict } of found) {
      const link = reference.sourceUrl ?? reference.url;
      const name =
        [reference.vendor, reference.material, reference.name, reference.colorName]
          .filter(Boolean)
          .join(" ") || reference.id;
      results.append(
        h(
          "li",
          { "data-reference": reference.id },
          swatch(reference.colorHex ?? "000000"),
          ` ${name} `,
          h(
            "span",
            { class: "text-muted-foreground" },
            `#${reference.colorHex}, ${verdictText(verdict)} (ΔE ${deltaE.toFixed(1)})`,
          ),
          link?.startsWith("https://")
            ? h(
                "a",
                {
                  href: link,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  class:
                    "ml-2 font-medium text-primary-text underline underline-offset-2 hover:no-underline",
                },
                t("reference.colors.view"),
              )
            : null,
        ),
      );
    }
  }

  select.addEventListener("change", () => {
    const spool = spools.get(select.value);
    if (spool?.colors[0]) hexInput.value = `#${spool.colors[0]}`;
    search();
  });
  hexInput.addEventListener("input", () => {
    // Typing a color of one's own leaves the chosen spool behind.
    select.value = "";
    search();
  });
  sameMaterial.addEventListener("change", search);

  return h(
    "details",
    { id: "color-finder", class: "mt-4 rounded-lg border p-3" },
    h("summary", { class: "cursor-pointer text-sm font-medium" }, t("reference.colors.title")),
    h("p", { class: "mt-2 text-xs text-muted-foreground" }, t("reference.colors.help")),
    h(
      "label",
      { class: "mt-2 block text-xs font-medium", for: "color-finder-spool" },
      t("reference.colors.spool"),
      select,
    ),
    h(
      "label",
      { class: "mt-2 block text-xs font-medium", for: "color-finder-hex" },
      t("reference.colors.hex"),
      hexInput,
    ),
    h(
      "label",
      { class: "mt-2 block text-xs", for: "color-finder-material" },
      sameMaterial,
      t("reference.colors.sameMaterial"),
    ),
    status,
    results,
  );
}
