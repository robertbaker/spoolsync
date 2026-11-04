import { local, read, write } from "~/lib/browser/storage/access";
import { t, type MessageKey } from "~/lib/i18n";

import { h } from "../dom";
import { buildItems, buildSpoolItems } from "./commands";
import type { PaletteItem } from "./items";
import { pushRecent, resultsFor } from "./rank";

const RECENT_KEY = "spoolsync:palette-recent";
/** Recently chosen commands and spools remembered, shown first when the palette opens. */
const MAX_RECENTS = 8;

function readRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(local, RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

let dialog: HTMLDialogElement | undefined;
let input: HTMLInputElement;
let list: HTMLUListElement;
let status: HTMLElement;
let commands: PaletteItem[] = [];
let spools: PaletteItem[] = [];
let shown: PaletteItem[] = [];
let active = 0;
let opener: Element | null = null;

const optionId = (index: number) => `palette-option-${index}`;

function setActive(index: number, scroll = true): void {
  if (!shown.length) {
    active = 0;
    input.removeAttribute("aria-activedescendant");
    return;
  }
  active = (index + shown.length) % shown.length;
  list.querySelectorAll("[role=option]").forEach((option, position) => {
    option.setAttribute("aria-selected", String(position === active));
  });
  input.setAttribute("aria-activedescendant", optionId(active));
  if (scroll) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
}

function renderList(): void {
  const recents = readRecents();
  const browsing = input.value.trim() === "";
  // With nothing typed, recently chosen spools sit beside the commands (spools are otherwise only
  // found by searching), and everything recently chosen is listed first under "Recent".
  const recentSpools = browsing ? spools.filter((spool) => recents.includes(spool.id)) : [];
  shown = resultsFor(input.value, [...commands, ...recentSpools], spools, recents);
  const recentIds = new Set(recents);
  const rows: Node[] = [];
  let group = "";
  shown.forEach((item, index) => {
    const heading =
      browsing && recentIds.has(item.id)
        ? t("palette.recent")
        : t(`palette.group.${item.group}` as MessageKey);
    if (heading !== group) {
      group = heading;
      rows.push(
        h(
          "li",
          {
            role: "presentation",
            class: "px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
          },
          group,
        ),
      );
    }
    const row = h(
      "li",
      {
        id: optionId(index),
        role: "option",
        "aria-selected": "false",
        class:
          "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-primary/15 aria-selected:text-foreground",
      },
      h("span", { class: "min-w-0 truncate font-medium" }, item.title),
      item.subtitle
        ? h("span", { class: "shrink-0 truncate text-xs text-muted-foreground" }, item.subtitle)
        : null,
    );
    row.addEventListener("click", () => choose(item));
    row.addEventListener("mousemove", () => {
      if (active !== index) setActive(index, false);
    });
    rows.push(row);
  });
  list.replaceChildren(...rows);
  status.textContent = shown.length
    ? t("palette.resultCount", { count: shown.length })
    : t("palette.noResults");
  setActive(0, false);
  input.setAttribute("aria-expanded", String(shown.length > 0));
  if (!shown.length)
    list.append(
      h(
        "li",
        { role: "presentation", class: "px-3 py-6 text-center text-sm text-muted-foreground" },
        t("palette.nothingMatches"),
      ),
    );
}

function choose(item: PaletteItem): void {
  write(local, RECENT_KEY, JSON.stringify(pushRecent(readRecents(), item.id, MAX_RECENTS)));
  const target = opener;
  dialog?.close();
  // Hand focus back first so an action that opens another dialog can take it afterwards.
  if (target instanceof HTMLElement && target.isConnected) target.focus();
  setTimeout(item.run, 0);
}

function ensure(): HTMLDialogElement {
  if (dialog) return dialog;
  input = h("input", {
    id: "palette-input",
    type: "text",
    role: "combobox",
    class: "field-input mt-0 w-full text-base",
    placeholder: t("palette.placeholder"),
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-label": t("palette.label"),
    "aria-expanded": "true",
    "aria-controls": "palette-list",
    "aria-autocomplete": "list",
  });
  list = h("ul", {
    id: "palette-list",
    role: "listbox",
    "aria-label": t("palette.results"),
    class: "mt-2 max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain",
  });
  status = h("p", { class: "sr-only", role: "status" });
  dialog = h(
    "dialog",
    {
      id: "palette-dialog",
      closedby: "any",
      "aria-label": t("palette.label"),
      class:
        "m-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
    },
    h(
      "div",
      { class: "p-3" },
      input,
      list,
      status,
      h(
        "p",
        { class: "mt-2 flex gap-3 px-1 text-xs text-muted-foreground" },
        h("span", { "data-palette-hint": "palette.hintMove" }, t("palette.hintMove")),
        h("span", { "data-palette-hint": "palette.hintChoose" }, t("palette.hintChoose")),
        h("span", { "data-palette-hint": "palette.hintClose" }, t("palette.hintClose")),
      ),
    ),
  );
  input.addEventListener("input", renderList);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(shown.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = shown[active];
      if (item) choose(item);
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
  dialog.addEventListener("close", () => {
    // Esc and backdrop clicks end up here; `choose` already restored focus for the other path.
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    opener = null;
  });
  document.body.append(dialog);
  return dialog;
}

/** Re-applies the page language to the labels built once when the palette was first created. */
function relabel(element: HTMLDialogElement): void {
  input.placeholder = t("palette.placeholder");
  input.setAttribute("aria-label", t("palette.label"));
  list.setAttribute("aria-label", t("palette.results"));
  element.setAttribute("aria-label", t("palette.label"));
  for (const hint of element.querySelectorAll<HTMLElement>("[data-palette-hint]"))
    hint.textContent = t(hint.dataset["paletteHint"] as MessageKey);
}

export function isPaletteOpen(): boolean {
  return Boolean(dialog?.open);
}

export function closePalette(): void {
  dialog?.close();
}

export function openPalette(query = ""): void {
  const element = ensure();
  if (element.open) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  relabel(element);
  commands = buildItems();
  spools = buildSpoolItems();
  input.value = query;
  renderList();
  element.showModal();
  input.focus();
}
