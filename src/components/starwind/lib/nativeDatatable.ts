type RuntimeRoot = Document | HTMLElement;

interface DatatableConfig {
  pageLength?: number;
  selecting?: boolean;
  rowSelectingOptions?: {
    selectAllSelector?: string;
    individualSelector?: string;
  };
}

interface DatatableState {
  page: number;
  pageLength: number;
  query: string;
  rows: HTMLTableRowElement[];
  sortColumn: number | null;
  sortDirection: "asc" | "desc";
}

const stateByRoot = new WeakMap<HTMLElement, DatatableState>();

function parseConfig(root: HTMLElement): DatatableConfig {
  try {
    const value = JSON.parse(root.getAttribute("data-r5-datatable") || "{}") as unknown;
    return typeof value === "object" && value !== null ? (value as DatatableConfig) : {};
  } catch {
    return {};
  }
}

function query<T>(root: RuntimeRoot, selector: string): T | null {
  try {
    return root.querySelector(selector) as T | null;
  } catch {
    return null;
  }
}

function filteredRows(state: DatatableState): HTMLTableRowElement[] {
  const normalizedQuery = state.query.trim().toLocaleLowerCase();
  const rows = normalizedQuery
    ? state.rows.filter((row) =>
        (row.textContent ?? "").toLocaleLowerCase().includes(normalizedQuery),
      )
    : [...state.rows];

  if (state.sortColumn === null) return rows;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const direction = state.sortDirection === "asc" ? 1 : -1;
  return rows.sort((left, right) => {
    const leftValue = left.cells.item(state.sortColumn!)?.textContent?.trim() ?? "";
    const rightValue = right.cells.item(state.sortColumn!)?.textContent?.trim() ?? "";
    return collator.compare(leftValue, rightValue) * direction;
  });
}

function createPageButton(document: Document, page: number, active: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = active
    ? "inline-flex size-9 items-center justify-center rounded-md border border-primary bg-primary text-sm font-medium text-primary-foreground"
    : "inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted";
  button.dataset["r5DatatablePage"] = String(page);
  button.textContent = String(page + 1);
  button.setAttribute("aria-label", `Page ${page + 1}`);
  if (active) button.setAttribute("aria-current", "page");
  return button;
}

function updateSelection(root: HTMLElement, config: DatatableConfig): void {
  if (!config.selecting) return;
  const individualSelector =
    config.rowSelectingOptions?.individualSelector ??
    "[data-r5-datatable-row-selecting-individual]";
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>(individualSelector));
  const selectAllSelector = config.rowSelectingOptions?.selectAllSelector;
  const selectAll = selectAllSelector
    ? query<HTMLInputElement>(root, selectAllSelector)
    : query<HTMLInputElement>(
        root,
        "[data-r5-datatable-row-selecting-all], thead input[type=checkbox]",
      );
  if (!selectAll) return;
  const checked = boxes.filter((box) => box.checked).length;
  selectAll.checked = boxes.length > 0 && checked === boxes.length;
  selectAll.indeterminate = checked > 0 && checked < boxes.length;
}

function render(root: HTMLElement): void {
  const state = stateByRoot.get(root);
  if (!state) return;
  const rows = filteredRows(state);
  if (state.sortColumn !== null) {
    const orderedRows = [...rows, ...state.rows.filter((row) => !rows.includes(row))];
    orderedRows.forEach((row) => row.parentElement?.appendChild(row));
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageLength));
  state.page = Math.min(state.page, pageCount - 1);
  const firstIndex = state.page * state.pageLength;
  const visibleRows = new Set(rows.slice(firstIndex, firstIndex + state.pageLength));

  state.rows.forEach((row) => {
    row.hidden = !visibleRows.has(row);
    row.classList.toggle("hidden", row.hidden);
  });

  const from = rows.length === 0 ? 0 : firstIndex + 1;
  const to = Math.min(firstIndex + state.pageLength, rows.length);
  const setText = (selector: string, value: number) => {
    const target = query<HTMLElement>(root, selector);
    if (target) target.textContent = String(value);
  };
  setText("[data-r5-datatable-info-from]", from);
  setText("[data-r5-datatable-info-to]", to);
  setText("[data-r5-datatable-info-length]", rows.length);

  const paging = query<HTMLElement>(root, "[data-r5-datatable-paging]");
  if (paging) {
    const showPaging = pageCount > 1;
    paging.hidden = !showPaging;
    paging.classList.toggle("hidden", !showPaging);
  }

  const pages = query<HTMLElement>(root, "[data-r5-datatable-paging-pages]");
  if (pages) {
    pages.replaceChildren();
    const start = Math.max(0, Math.min(state.page - 2, pageCount - 5));
    const end = Math.min(pageCount, start + 5);
    for (let page = start; page < end; page += 1) {
      pages.appendChild(createPageButton(root.ownerDocument, page, page === state.page));
    }
  }

  const previous = query<HTMLButtonElement>(root, "[data-r5-datatable-paging-prev]");
  const next = query<HTMLButtonElement>(root, "[data-r5-datatable-paging-next]");
  if (previous) previous.disabled = state.page === 0;
  if (next) next.disabled = state.page >= pageCount - 1;
  updateSelection(root, parseConfig(root));
}

function configure(root: HTMLElement): void {
  const table = query<HTMLTableElement>(root, "table");
  if (!table) return;
  const config = parseConfig(root);
  const pageEntity = query<HTMLSelectElement>(root, "[data-r5-datatable-page-entities]");
  const configuredLength = Number(pageEntity?.value || config.pageLength || 10);
  const pageLength =
    Number.isFinite(configuredLength) && configuredLength > 0 ? configuredLength : 10;
  stateByRoot.set(root, {
    page: 0,
    pageLength,
    query: "",
    rows: Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")),
    sortColumn: null,
    sortDirection: "asc",
  });
  table
    .querySelectorAll<HTMLTableCellElement>("thead th:not([data-r5-datatable-ordering-disabled])")
    .forEach((header) => {
      header.tabIndex = 0;
      header.setAttribute("aria-sort", "none");
    });
  root.setAttribute("data-r5-datatable-ready", "");
  render(root);
}

function closestRoot(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-r5-datatable]") : null;
}

function tableMatrix(root: HTMLElement): string[][] {
  const state = stateByRoot.get(root);
  const table = query<HTMLTableElement>(root, "table");
  if (!state || !table) return [];
  const headers = Array.from(table.tHead?.rows.item(0)?.cells ?? [])
    .filter((cell) => !cell.hasAttribute("data-r5-datatable-ordering-disabled"))
    .map((cell) => cell.textContent?.trim() ?? "");
  const rows = filteredRows(state).map((row) =>
    Array.from(row.cells)
      .filter(
        (cell) =>
          !cell.querySelector("input[type=checkbox]") &&
          !cell.querySelector('[aria-haspopup="menu"]'),
      )
      .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  return [headers, ...rows].filter((row) => row.length > 0);
}

function escapeDelimited(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function download(root: HTMLElement, content: string, type: string, extension: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = root.ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = `table-export.${extension}`;
  anchor.hidden = true;
  root.ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function writeClipboard(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard permissions are browser-controlled; leave the table unchanged.
  }
}

function printTable(root: HTMLElement, matrix: string[][]): void {
  const popup = root.ownerDocument.defaultView?.open("", "_blank", "noopener,noreferrer");
  if (!popup) return;
  popup.document.title = "Table export";
  const table = popup.document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font:14px system-ui,sans-serif";
  matrix.forEach((values, rowIndex) => {
    const row = popup.document.createElement("tr");
    values.forEach((value) => {
      const cell = popup.document.createElement(rowIndex === 0 ? "th" : "td");
      cell.textContent = value;
      cell.style.cssText = "border:1px solid var(--border);padding:8px;text-align:left";
      row.appendChild(cell);
    });
    table.appendChild(row);
  });
  popup.document.body.appendChild(table);
  popup.focus();
  popup.print();
  popup.close();
}

async function exportTable(root: HTMLElement, action: string): Promise<void> {
  const matrix = tableMatrix(root);
  if (matrix.length === 0) return;
  const tsv = matrix.map((row) => row.join("\t")).join("\n");
  if (action === "copy") {
    await writeClipboard(tsv);
    return;
  }
  if (action === "csv") {
    download(
      root,
      matrix.map((row) => row.map(escapeDelimited).join(",")).join("\n"),
      "text/csv;charset=utf-8",
      "csv",
    );
    return;
  }
  if (action === "excel") {
    const html = `<table>${matrix.map((row) => `<tr>${row.map((value) => `<td>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</td>`).join("")}</tr>`).join("")}</table>`;
    download(root, html, "application/vnd.ms-excel", "xls");
    return;
  }
  if (action === "print" || action === "pdf") printTable(root, matrix);
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-r5-datatable-search"))
    return;
  const root = closestRoot(target);
  const state = root ? stateByRoot.get(root) : null;
  if (!root || !state) return;
  state.query = target.value;
  state.page = 0;
  render(root);
}

function handleChange(event: Event): void {
  const target = event.target;
  const root = closestRoot(target);
  const state = root ? stateByRoot.get(root) : null;
  if (!root || !state || !(target instanceof HTMLElement)) return;
  if (
    target.hasAttribute("data-r5-datatable-page-entities") &&
    target instanceof HTMLSelectElement
  ) {
    const pageLength = Number(target.value);
    if (Number.isFinite(pageLength) && pageLength > 0) state.pageLength = pageLength;
    state.page = 0;
    render(root);
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
  const config = parseConfig(root);
  const selectAllSelector = config.rowSelectingOptions?.selectAllSelector;
  const isSelectAll =
    target.hasAttribute("data-r5-datatable-row-selecting-all") ||
    (selectAllSelector ? target.matches(selectAllSelector) : target.closest("thead") !== null);
  if (isSelectAll) {
    const selector =
      config.rowSelectingOptions?.individualSelector ??
      "[data-r5-datatable-row-selecting-individual]";
    root.querySelectorAll<HTMLInputElement>(selector).forEach((checkbox) => {
      checkbox.checked = target.checked;
    });
  }
  updateSelection(root, config);
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const root = closestRoot(target);
  const state = root ? stateByRoot.get(root) : null;
  if (!root || !state) return;

  const pageButton = target.closest<HTMLElement>("[data-r5-datatable-page]");
  if (pageButton) {
    state.page = Number(pageButton.dataset["r5DatatablePage"] ?? 0);
    render(root);
    return;
  }
  if (target.closest("[data-r5-datatable-paging-prev]")) {
    state.page = Math.max(0, state.page - 1);
    render(root);
    return;
  }
  if (target.closest("[data-r5-datatable-paging-next]")) {
    state.page += 1;
    render(root);
    return;
  }
  const action = target.closest<HTMLElement>("[data-r5-datatable-action-type]");
  if (action) {
    void exportTable(root, action.getAttribute("data-r5-datatable-action-type") ?? "").catch(
      () => undefined,
    );
    return;
  }
  const header = target.closest<HTMLTableCellElement>("th");
  if (!header || header.hasAttribute("data-r5-datatable-ordering-disabled")) return;
  const table = query<HTMLTableElement>(root, "table");
  const column =
    table && header.parentElement ? Array.from(header.parentElement.children).indexOf(header) : -1;
  if (column < 0) return;
  state.sortDirection =
    state.sortColumn === column && state.sortDirection === "asc" ? "desc" : "asc";
  state.sortColumn = column;
  state.page = 0;
  root.querySelectorAll<HTMLTableCellElement>("thead th[aria-sort]").forEach((candidate) => {
    candidate.setAttribute("aria-sort", "none");
  });
  header.setAttribute("aria-sort", state.sortDirection === "asc" ? "ascending" : "descending");
  root
    .querySelectorAll(".r5-datatable-ordering-asc, .r5-datatable-ordering-desc")
    .forEach((icon) => icon.classList.add("hidden"));
  header.querySelector(`.r5-datatable-ordering-${state.sortDirection}`)?.classList.remove("hidden");
  render(root);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const header =
    event.target instanceof Element
      ? event.target.closest<HTMLTableCellElement>(
          "[data-r5-datatable] th:not([data-r5-datatable-ordering-disabled])",
        )
      : null;
  if (!header) return;
  event.preventDefault();
  header.click();
}

export function initNativeDatatables(root: RuntimeRoot): () => void {
  const datatables = Array.from(root.querySelectorAll<HTMLElement>("[data-r5-datatable]"));
  datatables.forEach(configure);
  if (datatables.length === 0) return () => undefined;

  const onInput = (event: Event) => handleInput(event);
  const onChange = (event: Event) => handleChange(event);
  const onClick = (event: Event) => handleClick(event as MouseEvent);
  const onKeydown = (event: Event) => handleKeydown(event as KeyboardEvent);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  return () => {
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    datatables.forEach((datatable) => datatable.removeAttribute("data-r5-datatable-ready"));
  };
}
