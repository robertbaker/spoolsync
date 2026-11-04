import type { SourceId } from "@spoolsync/core/core/model";

import {
  SERVICE_COUNT,
  SERVICE_VIEWS,
  matchesMatrixFilter,
  matchesMatrixQuery,
  type MatrixFilter,
} from "~/lib/services";

const FILTER_VALUES: readonly MatrixFilter[] = ["all", "write", "api", "file"];

/** The tools that pass the search text and capability filter, in registry order. */
export function visibleServiceIds(query: string, filter: MatrixFilter): SourceId[] {
  return SERVICE_VIEWS.filter(
    (service) => matchesMatrixFilter(service, filter) && matchesMatrixQuery(service, query),
  ).map((service) => service.id);
}

/** The sentence announced to screen readers after each change. */
export function matrixStatus(count: number, query: string, filter: MatrixFilter): string {
  if (count === 0) return "No tools match.";
  if (count === SERVICE_COUNT && !query.trim() && filter === "all") {
    return `Showing all ${SERVICE_COUNT} tools.`;
  }
  return `Showing ${count} of ${SERVICE_COUNT} tools.`;
}

function isFilter(value: string | undefined): value is MatrixFilter {
  return FILTER_VALUES.includes(value as MatrixFilter);
}

/** Wires search and filter chips on the home page's "Supported tools" section. */
export function wireServiceMatrix(root: ParentNode = document): void {
  const search = root.querySelector<HTMLInputElement>("[data-matrix-search]");
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-matrix-filter]")];
  const rows = [...root.querySelectorAll<HTMLElement>("[data-matrix-row]")];
  const status = root.querySelector<HTMLElement>("#matrix-status");
  const empty = root.querySelector<HTMLElement>("#matrix-empty");
  if (!search || buttons.length === 0 || rows.length === 0) return;

  let filter: MatrixFilter = "all";

  const apply = () => {
    const visible = new Set<string>(visibleServiceIds(search.value, filter));
    for (const row of rows) row.hidden = !visible.has(row.dataset["matrixRow"] ?? "");
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset["matrixFilter"] === filter));
    }
    if (empty) empty.hidden = visible.size > 0;
    if (status) status.textContent = matrixStatus(visible.size, search.value, filter);
  };

  search.addEventListener("input", apply);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const next = button.dataset["matrixFilter"];
      filter = isFilter(next) ? next : "all";
      apply();
    });
  }
  apply();
}
