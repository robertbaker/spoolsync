import {
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";

import { byId, h } from "../dom";

export function createInventoryTable(results: ReadonlyMap<SourceId, LoadResult>) {
  function swatches(colors: string[]): HTMLElement {
    if (!colors.length) return h("span", { class: "text-muted-foreground" }, "—");
    return h(
      "span",
      { class: "flex gap-1", title: colors.map((c) => `#${c}`).join(", ") },
      ...colors.slice(0, 4).map((color) => {
        const swatch = h("span", {
          class: "filament-swatch inline-block size-4 rounded-full border",
        });
        swatch.style.backgroundColor = `#${color}`;
        return swatch;
      }),
    );
  }

  function weight(spool: CommonSpool): string {
    const remaining = spool.remainingWeight === null ? "?" : Math.round(spool.remainingWeight);
    const initial = spool.initialWeight === null ? "?" : Math.round(spool.initialWeight);
    return `${remaining} / ${initial} g`;
  }

  function links(spool: CommonSpool): string {
    const {
      spoolmanId,
      spoolstockShortId,
      spoolioId,
      tigertagUid,
      threeDfpId,
      bambuddyId,
      filameterId,
      filadexId,
      filamentdbSerial,
    } = spool.crossIds;
    const parts = [];
    if (spool.source !== "spoolman" && spoolmanId !== undefined)
      parts.push(`Spoolman #${spoolmanId}`);
    if (spool.source !== "spoolstock" && spoolstockShortId)
      parts.push(`Spoolstock ${spoolstockShortId}`);
    if (spool.source !== "spoolio" && spoolioId) parts.push(`Spoolio ${spoolioId.slice(0, 8)}`);
    if (spool.source !== "tigertag" && tigertagUid)
      parts.push(`TigerTag ${tigertagUid.slice(0, 14)}`);
    if (spool.source !== "threeDfp" && threeDfpId) parts.push(`3DFP ${threeDfpId.slice(0, 8)}`);
    if (spool.source !== "bambuddy" && bambuddyId !== undefined)
      parts.push(`Bambuddy #${bambuddyId}`);
    if (spool.source !== "filameter" && filameterId)
      parts.push(`FilaMeter ${filameterId.slice(0, 8)}`);
    if (spool.source !== "filadex" && filadexId) parts.push(`Filadex ${filadexId.slice(0, 8)}`);
    if (spool.source !== "filamentdb" && filamentdbSerial)
      parts.push(`FilamentDB ${filamentdbSerial.slice(0, 8)}`);
    return parts.join(", ") || "—";
  }

  let searchQuery = "";
  const searchWrap = document.getElementById("loaded-filter-wrap");
  const searchInput = document.getElementById("spool-search-input") as HTMLInputElement | null;

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderTable();
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "/" &&
        searchWrap &&
        !searchWrap.hidden &&
        document.activeElement !== searchInput &&
        !(
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  function renderTable(): void {
    const all = [...results.values()].flatMap((result) => result.spools);
    const container = byId("loaded-table");
    const counts = [...results.values()].map(
      (r) => `${SOURCE_LABELS[r.source]}: ${r.spools.length}`,
    );

    if (searchWrap) {
      searchWrap.hidden = all.length === 0;
    }

    if (!all.length) {
      byId("loaded-summary").textContent = "";
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          "Nothing loaded yet.",
        ),
      );
      return;
    }

    const filtered = searchQuery
      ? all.filter((s) => {
          const text = [s.vendor, s.material, s.name, s.location, s.sourceId, ...s.colors]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(searchQuery);
        })
      : all;

    byId("loaded-summary").textContent = searchQuery
      ? `Showing ${filtered.length} of ${all.length} spools (${counts.join(" · ")})`
      : counts.join(" · ");

    if (searchQuery && !filtered.length) {
      container.replaceChildren(
        h(
          "p",
          { class: "rounded-lg border border-dashed p-8 text-center text-muted-foreground" },
          `No spools matching "${searchQuery}".`,
        ),
      );
      return;
    }

    const headers = [
      "Source",
      "ID",
      "Brand",
      "Material",
      "Name",
      "Color",
      "Remaining",
      "Location",
      "Linked to",
    ];
    const rows = filtered.map((spool) =>
      h(
        "tr",
        { class: spool.archived ? "text-muted-foreground/70" : "" },
        h("td", { class: "whitespace-nowrap font-medium" }, SOURCE_LABELS[spool.source]),
        h(
          "td",
          { class: "max-w-40 truncate font-mono text-xs", title: spool.sourceId },
          spool.sourceId,
        ),
        h("td", {}, spool.vendor ?? "—"),
        h("td", {}, spool.material ?? "—"),
        h("td", {}, spool.name ?? "—", spool.archived ? " (archived)" : ""),
        h("td", {}, swatches(spool.colors)),
        h("td", { class: "whitespace-nowrap" }, weight(spool)),
        h("td", {}, spool.location ?? "—"),
        h("td", { class: "text-xs" }, links(spool)),
      ),
    );

    container.replaceChildren(
      h(
        "div",
        {
          class: "spool-table-wrapper",
          tabindex: "0",
          role: "region",
          "aria-labelledby": "loaded-heading",
        },
        h(
          "table",
          {},
          h("thead", {}, h("tr", {}, ...headers.map((label) => h("th", { scope: "col" }, label)))),
          h("tbody", {}, ...rows),
        ),
      ),
    );
  }

  return renderTable;
}
