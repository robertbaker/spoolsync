import { FIELD_LABELS } from "@spoolsync/core/core/compare";
import {
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import {
  defaultProviderSettings,
  FETCH_LIMITS,
  GENERIC_FIELD_ALIASES,
  NO_REFERENCE,
  PROVIDERS,
  REFERENCE_FIELDS,
  buildFetchConfig,
  providerById,
  type Pagination,
  type ProviderSettings,
  type ReferenceField,
  type ReferenceIO,
  type ReferenceItem,
  type ReferenceProposal,
  type ReferenceProviderId,
} from "@spoolsync/core/core/reference";

import { browserReferenceIO } from "~/lib/browser/reference-io";
import { browserSnapshots } from "~/lib/browser/reference-snapshot";
import {
  clearReferenceCache,
  loadAcceptedReferences,
  loadReferenceCache,
  loadReferenceCatalog,
  loadReferenceChoices,
  loadReferenceSettings,
  saveAcceptedReferences,
  saveReferenceCacheEntry,
  saveReferenceChoices,
  saveReferenceSettings,
  touchReferenceCache,
} from "~/lib/browser/storage/reference";

import { h, setChildren, showToast } from "../dom";
import { displayValue } from "./cleanup-view";
import { plural } from "./presentation";
import {
  FILTERS,
  ReferenceController,
  type CatalogInfo,
  type ReferenceFilter,
  type ReferenceSnapshots,
  type ReferenceStore,
} from "./reference-controller";

/** Cards drawn at once; "Show more" draws the next batch. */
const PAGE = 25;

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const PRESSED = "border-primary bg-primary/10 text-foreground";
const BADGE = {
  safe: "border-success/40 bg-success/10 text-success-text",
  review: "border-warning/40 bg-warning/10",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;
const VERDICT = {
  match: "Matches",
  close: "Close",
  mismatch: "Does not match",
} as const;

const browserStore: ReferenceStore = {
  loadSettings: loadReferenceSettings,
  saveSettings: saveReferenceSettings,
  loadAccepted: loadAcceptedReferences,
  saveAccepted: saveAcceptedReferences,
  loadChoices: loadReferenceChoices,
  saveChoices: saveReferenceChoices,
  loadCache: loadReferenceCache,
  loadCatalog: loadReferenceCatalog,
  saveCache: saveReferenceCacheEntry,
  touchCache: touchReferenceCache,
  clearCache: clearReferenceCache,
};

const spoolLabel = (spool: CommonSpool | undefined, key: string) =>
  spool
    ? [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") ||
      `Spool ${spool.sourceId}`
    : key;

/** A small color chip; the color is set through the style object, which a strict CSP allows. */
function swatch(hex: string | null | undefined): HTMLElement {
  const chip = h("span", {
    class: "filament-swatch inline-block size-5 shrink-0 rounded-full border",
    "aria-hidden": "true",
  });
  if (hex) chip.style.backgroundColor = `#${hex}`;
  return chip;
}

function colorChips(colors: readonly string[]): HTMLElement {
  return h(
    "span",
    { class: "inline-flex flex-wrap items-center gap-1" },
    ...colors.map((hex) =>
      h("span", { class: "inline-flex items-center gap-1 text-xs" }, swatch(hex), `#${hex}`),
    ),
    colors.length ? null : h("span", { class: "text-xs text-muted-foreground" }, "(empty)"),
  );
}

function labelled(label: string, id: string, control: HTMLElement): HTMLElement {
  return h("label", { for: id, class: "grid gap-1 text-xs text-muted-foreground" }, label, control);
}

const INPUT = "field-input mt-0 w-full py-1 text-xs";

function textInput(id: string, value: string, placeholder = ""): HTMLInputElement {
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

function numberInput(id: string, value: number | null, min: number, max: number): HTMLInputElement {
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

/**
 * The "Reference data" panel on the Load page. It matches the loaded inventories against a
 * reference catalog (a file you load, or a service you configure and fetch in this browser), shows
 * what the reference would fill in or correct beside what you have, and lets you accept or reject
 * each change. Accepting only saves a choice; the Sync page turns accepted changes into planned
 * updates, so nothing is written to a service from here.
 */
export function wireReferencePanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  store: ReferenceStore = browserStore,
  io: ReferenceIO = browserReferenceIO,
  snapshots: ReferenceSnapshots | null = browserSnapshots,
): { update(): void; open(): void; controller: ReferenceController } {
  const controller = new ReferenceController(results, store, io, snapshots);
  const details = h("details", {
    id: "reference-details",
    "data-panel": "reference",
    class: "rounded-xl border",
  });
  const summary = h(
    "summary",
    {
      class:
        "cursor-pointer rounded-xl p-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Reference data",
  );
  const content = h("div", { class: "px-4 pb-4" });
  details.append(summary, content);
  root.replaceChildren(details);

  let limit = PAGE;
  /** Message under the source controls: the result of the last load or fetch. */
  let sourceMessage: { tone: "info" | "error" | "warning"; text: string } | null = null;
  /** Unsaved endpoint settings being edited, per provider. */
  const drafts = new Map<ReferenceProviderId, ProviderSettings>();
  let settingsErrors: string[] = [];

  function summaryText(): string {
    const counts = controller.counts();
    if (!controller.catalog) return "Reference data (no catalog loaded)";
    const parts = [] as string[];
    if (counts.proposals) parts.push(plural(counts.proposals, "suggestion"));
    if (counts.needChoice) parts.push(`${counts.needChoice} to choose`);
    if (counts.accepted) parts.push(`${counts.accepted} accepted`);
    return parts.length
      ? `Reference data (${parts.join(", ")})`
      : "Reference data (nothing to fix)";
  }

  function focusKey(key: string | null | undefined): void {
    if (!key) return;
    [...content.querySelectorAll<HTMLElement>("[data-key]")]
      .find((element) => element.getAttribute("data-key") === key)
      ?.focus();
  }

  function act(change: () => number, done: (count: number) => string): void {
    const key = document.activeElement?.getAttribute("data-key");
    const count = change();
    if (count) showToast(done(count), "info");
    draw();
    focusKey(key);
    summary.textContent = summaryText();
  }

  // ---- Source -------------------------------------------------------------------------------

  function draftFor(id: ReferenceProviderId): ProviderSettings {
    let draft = drafts.get(id);
    if (!draft) {
      draft = structuredClone(controller.settings.providers[id] ?? defaultProviderSettings(id));
      drafts.set(id, draft);
    }
    return draft;
  }

  function fileSource(): HTMLElement {
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
          const info = controller.loadFile(file.name, text);
          sourceMessage = {
            tone: info.warnings.length || info.skipped ? "warning" : "info",
            text: `Read ${plural(info.usable, "filament")} from ${file.name}${info.skipped ? `; ${plural(info.skipped, "record")} could not be used` : ""}.`,
          };
          limit = PAGE;
          summary.textContent = summaryText();
          draw();
        })
        .catch((error: unknown) => {
          sourceMessage = {
            tone: "error",
            text: error instanceof Error ? error.message : String(error),
          };
          draw();
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

  function paginationControls(draft: ProviderSettings, id: string): HTMLElement {
    const kind = draft.pagination.kind;
    const select = h("select", { id: `${id}-paging`, class: INPUT });
    for (const [value, text] of [
      ["none", "One response"],
      ["next-link", "Next-page link in the response"],
      ["offset", "Record offset"],
      ["page", "Page number"],
    ] as const) {
      const option = h("option", { value }, text);
      option.selected = value === kind;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const value = select.value;
      draft.pagination =
        value === "next-link"
          ? { kind: "next-link", path: "next" }
          : value === "offset"
            ? { kind: "offset", offsetParam: "offset", limitParam: "limit", pageSize: 100 }
            : value === "page"
              ? { kind: "page", pageParam: "page", firstPage: 1 }
              : { kind: "none" };
      draw();
    });
    const extra: HTMLElement[] = [];
    const paging: Pagination = draft.pagination;
    const bind = (input: HTMLInputElement, apply: (value: string) => void) =>
      input.addEventListener("input", () => apply(input.value));
    if (paging.kind === "next-link") {
      const path = textInput(`${id}-next`, paging.path, "links.next");
      bind(path, (value) => (draft.pagination = { kind: "next-link", path: value.trim() }));
      extra.push(labelled("Path to the next-page link in the response", `${id}-next`, path));
    } else if (paging.kind === "offset") {
      const offset = textInput(`${id}-offset`, paging.offsetParam);
      const limitParam = textInput(`${id}-limit`, paging.limitParam);
      const size = numberInput(
        `${id}-size`,
        paging.pageSize,
        FETCH_LIMITS.pageSize.min,
        FETCH_LIMITS.pageSize.max,
      );
      const update = () =>
        (draft.pagination = {
          kind: "offset",
          offsetParam: offset.value.trim(),
          limitParam: limitParam.value.trim(),
          pageSize: Number(size.value) || 0,
        });
      for (const input of [offset, limitParam, size]) input.addEventListener("input", update);
      extra.push(
        labelled("Offset parameter", `${id}-offset`, offset),
        labelled("Page size parameter", `${id}-limit`, limitParam),
        labelled("Records per page", `${id}-size`, size),
      );
    } else if (paging.kind === "page") {
      const param = textInput(`${id}-page`, paging.pageParam);
      const first = numberInput(`${id}-first`, paging.firstPage, 0, 1);
      const limitParam = textInput(`${id}-limit`, paging.limitParam ?? "");
      const size = numberInput(
        `${id}-size`,
        paging.pageSize ?? null,
        FETCH_LIMITS.pageSize.min,
        FETCH_LIMITS.pageSize.max,
      );
      const update = () =>
        (draft.pagination = {
          kind: "page",
          pageParam: param.value.trim(),
          firstPage: Number(first.value) === 0 ? 0 : 1,
          ...(limitParam.value.trim() && Number(size.value) > 0
            ? { limitParam: limitParam.value.trim(), pageSize: Number(size.value) }
            : {}),
        });
      for (const input of [param, first, limitParam, size]) input.addEventListener("input", update);
      extra.push(
        labelled("Page parameter", `${id}-page`, param),
        labelled("First page number (0 or 1)", `${id}-first`, first),
        labelled("Page size parameter (optional)", `${id}-limit`, limitParam),
        labelled("Records per page (optional)", `${id}-size`, size),
      );
    }
    return h(
      "div",
      { class: "grid gap-2 sm:grid-cols-2" },
      labelled("Paging", `${id}-paging`, select),
      ...extra,
    );
  }

  /** What the load just did, in plain words. */
  function fetchedText(info: CatalogInfo): string {
    const count = plural(info.usable, "filament");
    const date = new Date(info.loadedAt).toLocaleDateString("en-GB");
    switch (info.origin) {
      case "cache":
        return `Used the copy this browser kept (${count}, from ${date}).`;
      case "snapshot":
        return `Used the copy built into SpoolSync (${count}, from ${date}); ${info.name} was not asked for the catalog.`;
      default:
        return `Downloaded ${count} from ${info.name}.`;
    }
  }

  function remoteSource(id: ReferenceProviderId): HTMLElement {
    const provider = providerById(id)!;
    const draft = draftFor(id);
    const prefix = `reference-${id}`;
    const url = textInput(
      `${prefix}-url`,
      draft.urlTemplate,
      "https://… ({page}, {offset} and {limit} are filled in)",
    );
    url.addEventListener("input", () => (draft.urlTemplate = url.value));
    const mapping = h("textarea", {
      id: `${prefix}-mapping`,
      rows: "6",
      class: `${INPUT} font-mono`,
      spellcheck: "false",
      placeholder: provider.defaults
        ? "Leave empty to use the built-in mapping for this service"
        : '{ "records": "data.items", "fields": { "vendor": "manufacturer.name", "colorHex": "hex" } }',
    });
    mapping.value = Object.keys(draft.mapping).length ? JSON.stringify(draft.mapping, null, 2) : "";
    mapping.addEventListener("input", () => {
      try {
        const parsed = mapping.value.trim() ? (JSON.parse(mapping.value) as unknown) : {};
        draft.mapping =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
        mapping.removeAttribute("aria-invalid");
      } catch {
        mapping.setAttribute("aria-invalid", "true");
      }
    });
    const ttl = numberInput(`${prefix}-ttl`, draft.ttlHours, 0, 720);
    ttl.addEventListener("input", () => (draft.ttlHours = Number(ttl.value) || 0));
    const interval = numberInput(
      `${prefix}-interval`,
      draft.minIntervalMs,
      0,
      FETCH_LIMITS.minIntervalMs.max,
    );
    interval.addEventListener("input", () => (draft.minIntervalMs = Number(interval.value) || 0));
    const credit = textInput(`${prefix}-credit`, draft.attribution, provider.info.attribution);
    credit.addEventListener("input", () => (draft.attribution = credit.value));

    const save = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `save-${id}` },
      "Save settings",
    );
    save.addEventListener("click", () => {
      const checked = buildFetchConfig(id, draft);
      settingsErrors = checked.ok ? [] : checked.errors;
      if (checked.ok) {
        controller.saveProviderSettings(id, structuredClone(draft));
        sourceMessage = { tone: "info", text: "Settings saved." };
      }
      draw();
    });
    const fetchNow = (force: boolean) => async () => {
      const checked = buildFetchConfig(id, draft);
      if (!checked.ok) {
        settingsErrors = checked.errors;
        draw();
        return;
      }
      controller.saveProviderSettings(id, structuredClone(draft));
      settingsErrors = [];
      sourceMessage = { tone: "info", text: "Fetching…" };
      draw();
      const outcome = await controller.fetchProvider(id, {
        force,
        onProgress: (progress) => {
          sourceMessage = {
            tone: "info",
            text: `Fetching… ${plural(progress.pages, "page")}, ${plural(progress.records, "record")}.`,
          };
          const line = content.querySelector("#reference-source-message");
          if (line) line.textContent = sourceMessage.text;
        },
      });
      if (outcome.kind === "stale") return;
      if (outcome.kind === "ok") {
        const { info } = outcome;
        sourceMessage = {
          tone:
            info.warnings.length || (info.note && !info.note.startsWith("Checked"))
              ? "warning"
              : "info",
          text: [fetchedText(info), info.note].filter(Boolean).join(" "),
        };
        limit = PAGE;
      } else if (outcome.kind === "invalid") {
        settingsErrors = outcome.errors;
        sourceMessage = null;
      } else {
        sourceMessage = {
          tone: outcome.cancelled ? "info" : "error",
          text: outcome.cancelled ? "Fetch cancelled." : outcome.message,
        };
      }
      summary.textContent = summaryText();
      draw();
    };
    const fetchButton = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `fetch-${id}` },
      "Fetch",
    );
    fetchButton.disabled = controller.busy;
    fetchButton.addEventListener("click", () => void fetchNow(false)());
    const refetch = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `refetch-${id}` },
      "Fetch again",
    );
    refetch.disabled = controller.busy;
    refetch.addEventListener("click", () => void fetchNow(true)());
    const cancel = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `cancel-${id}` },
      "Cancel",
    );
    cancel.disabled = !controller.busy;
    cancel.addEventListener("click", () => {
      controller.cancel();
      sourceMessage = { tone: "info", text: "Fetch cancelled." };
      draw();
    });
    const clear = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `clear-cache-${id}` },
      "Clear cached copy",
    );
    clear.disabled = !store.loadCache()[id];
    clear.addEventListener("click", () => {
      void store.clearCache(id).then(() => {
        sourceMessage = { tone: "info", text: "Cached copy removed." };
        draw();
      });
    });
    const cached = controller.cached(id);

    return h(
      "div",
      { class: "mt-3 grid gap-3" },
      provider.info.status === "needs-endpoint-config"
        ? h(
            "div",
            {
              class: "rounded-md border border-warning/40 bg-warning/10 p-3 text-xs",
              role: "note",
            },
            h(
              "p",
              { class: "font-medium text-foreground" },
              `${provider.info.label} needs an endpoint before it can be used`,
            ),
            h(
              "p",
              { class: "mt-1 text-muted-foreground" },
              `SpoolSync does not ship a built-in address or field mapping for ${provider.info.label}: its real response format is unverified, and nothing here is guessed or mocked. Enter the address and mapping below (see ${provider.info.docsUrl ?? "its documentation"}), or download its data and load the file instead.`,
            ),
            h(
              "details",
              { class: "mt-2" },
              h(
                "summary",
                {
                  class:
                    "cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary",
                },
                "What is still missing",
              ),
              h(
                "ul",
                { class: "mt-1 list-disc pl-5 text-muted-foreground" },
                ...provider.info.remaining.map((line) => h("li", {}, line)),
              ),
            ),
          )
        : null,
      labelled("Address (https only)", `${prefix}-url`, url),
      labelled(
        "Field mapping (JSON; leave empty to use the generic names)",
        `${prefix}-mapping`,
        mapping,
      ),
      paginationControls(draft, prefix),
      h(
        "div",
        { class: "grid gap-2 sm:grid-cols-3" },
        labelled("Keep fetched data for (hours, 0 = always fetch)", `${prefix}-ttl`, ttl),
        labelled("Pause between requests (ms)", `${prefix}-interval`, interval),
        labelled("Credit line (optional)", `${prefix}-credit`, credit),
      ),
      settingsErrors.length
        ? h(
            "ul",
            { class: "list-disc pl-5 text-xs text-error-text", role: "alert" },
            ...settingsErrors.map((error) => h("li", {}, error)),
          )
        : null,
      h(
        "div",
        { class: "flex flex-wrap items-center gap-2" },
        save,
        fetchButton,
        refetch,
        cancel,
        clear,
      ),
      cached
        ? h(
            "p",
            { class: "text-xs text-muted-foreground" },
            `A copy fetched ${new Date(cached.fetchedAt).toLocaleString()} is kept and still fresh.`,
          )
        : null,
      h(
        "p",
        { class: "text-xs text-muted-foreground" },
        "Fetching happens in this browser only, with no cookies and no sign-in, and a service must allow requests from other sites. If the browser blocks the request, download the data and load it as a file.",
      ),
    );
  }

  function sourceSection(): HTMLElement {
    const select = h("select", { id: "reference-provider", class: `${INPUT} w-auto` });
    for (const provider of PROVIDERS) {
      const option = h("option", { value: provider.info.id }, provider.info.label);
      option.selected = provider.info.id === controller.settings.providerId;
      select.append(option);
    }
    select.addEventListener("change", () => {
      controller.setProvider(select.value as ReferenceProviderId);
      settingsErrors = [];
      sourceMessage = null;
      draw();
      focusKey("reference-provider");
    });
    select.setAttribute("data-key", "reference-provider");
    const id = controller.settings.providerId;
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
      id === "file" ? fileSource() : remoteSource(id),
      h(
        "p",
        {
          id: "reference-source-message",
          class: `mt-3 text-sm ${sourceMessage?.tone === "error" ? "text-error-text" : sourceMessage?.tone === "warning" ? "text-warning-text" : "text-muted-foreground"}`,
          role: sourceMessage?.tone === "error" ? "alert" : "status",
          "aria-live": "polite",
        },
        sourceMessage?.text ?? "",
      ),
    );
  }

  function catalogSection(): HTMLElement | null {
    const info = controller.info;
    if (!info) return null;
    const unload = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "unload-reference" },
      "Unload catalog",
    );
    unload.addEventListener("click", () => {
      controller.unload();
      sourceMessage = null;
      summary.textContent = summaryText();
      draw();
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
      h("div", { class: "mt-2" }, unload),
    );
  }

  // ---- Policy -------------------------------------------------------------------------------

  function policySection(): HTMLElement {
    const policy = controller.policy;
    const rows = REFERENCE_FIELDS.map((field) => {
      const use = h("input", { type: "checkbox", class: "size-4", "data-key": `use-${field}` });
      use.checked = policy.fields.includes(field);
      const over = h("input", { type: "checkbox", class: "size-4", "data-key": `over-${field}` });
      over.checked = policy.overwrite.includes(field);
      over.disabled = !use.checked;
      const apply = (fields: ReferenceField[], overwrite: ReferenceField[]) => {
        const key = document.activeElement?.getAttribute("data-key");
        controller.setPolicy({
          fields: REFERENCE_FIELDS.filter((candidate) => fields.includes(candidate)),
          overwrite: REFERENCE_FIELDS.filter(
            (candidate) => overwrite.includes(candidate) && fields.includes(candidate),
          ),
        });
        limit = PAGE;
        draw();
        focusKey(key);
        summary.textContent = summaryText();
      };
      use.addEventListener("change", () =>
        apply(use.checked ? [...policy.fields, field] : policy.fields.filter((f) => f !== field), [
          ...policy.overwrite,
        ]),
      );
      over.addEventListener("change", () =>
        apply(
          [...policy.fields],
          over.checked ? [...policy.overwrite, field] : policy.overwrite.filter((f) => f !== field),
        ),
      );
      use.setAttribute("aria-label", `Use the reference for ${FIELD_LABELS[field]}`);
      over.setAttribute("aria-label", `Allow the reference to overwrite ${FIELD_LABELS[field]}`);
      return h(
        "li",
        { class: "flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-xs" },
        h("span", { class: "font-medium text-foreground" }, FIELD_LABELS[field]),
        h(
          "span",
          { class: "flex items-center gap-3 text-muted-foreground" },
          h("label", { class: "flex items-center gap-1" }, use, "Use"),
          h("label", { class: "flex items-center gap-1" }, over, "Overwrite"),
        ),
      );
    });
    return h(
      "details",
      { class: "mt-4 rounded-lg border" },
      h(
        "summary",
        {
          class:
            "cursor-pointer p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary",
        },
        `Fields (${policy.fields.length} used, ${policy.overwrite.length} may overwrite)`,
      ),
      h(
        "div",
        { class: "px-3 pb-3" },
        h(
          "p",
          { class: "text-xs text-muted-foreground" },
          "By default the reference only fills in values you are missing. Turn on Overwrite for a field to also be offered corrections where your value differs; you still accept each one. The brand is how spools are matched and the price is what you paid, so both are off.",
        ),
        h("ul", { class: "mt-2 grid gap-1.5 sm:grid-cols-2" }, ...rows),
      ),
    );
  }

  // ---- Results ------------------------------------------------------------------------------

  const spoolIndex = (): Map<string, CommonSpool> => {
    const spools = new Map<string, CommonSpool>();
    for (const loaded of results.values())
      for (const spool of loaded.spools) spools.set(`${spool.source}:${spool.sourceId}`, spool);
    return spools;
  };

  function proposalRow(proposal: ReferenceProposal, label: string): HTMLElement {
    const status = controller.status(proposal);
    const accept = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${status === "accepted" ? PRESSED : ""}`,
        "aria-pressed": String(status === "accepted"),
        "aria-label": `Accept change: ${label}, ${FIELD_LABELS[proposal.field]}`,
        "data-key": `accept-${proposal.id}`,
      },
      "Accept",
    );
    accept.disabled = !proposal.applicable;
    accept.addEventListener("click", () =>
      act(
        () =>
          status === "accepted"
            ? controller.reset([proposal.id])
            : controller.accept([proposal.id]),
        (count) =>
          status === "accepted"
            ? `Took back ${plural(count, "choice")}`
            : `Accepted ${plural(count, "change")}`,
      ),
    );
    const reject = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${status === "rejected" ? PRESSED : ""}`,
        "aria-pressed": String(status === "rejected"),
        "aria-label": `Reject change: ${label}, ${FIELD_LABELS[proposal.field]}`,
        "data-key": `reject-${proposal.id}`,
      },
      "Reject",
    );
    reject.addEventListener("click", () =>
      act(
        () =>
          status === "rejected"
            ? controller.reset([proposal.id])
            : controller.reject([proposal.id]),
        (count) =>
          status === "rejected"
            ? `Took back ${plural(count, "choice")}`
            : `Rejected ${plural(count, "change")}`,
      ),
    );
    return h(
      "li",
      { class: "grid gap-1 rounded-md border p-2 text-sm", "data-proposal": proposal.id },
      h(
        "div",
        { class: "flex flex-wrap items-start justify-between gap-2" },
        h(
          "div",
          { class: "min-w-0 flex-1" },
          h(
            "p",
            { class: "flex flex-wrap items-center gap-2 font-medium" },
            FIELD_LABELS[proposal.field],
            h(
              "span",
              {
                class: `rounded-full border px-2 py-0.5 text-xs font-normal ${proposal.confidence === "safe" ? BADGE.safe : BADGE.review}`,
              },
              proposal.kind === "fill"
                ? proposal.confidence === "safe"
                  ? "Fills a gap"
                  : "Fills a gap, review"
                : "Overwrites",
            ),
          ),
          h(
            "div",
            { class: "mt-1 grid gap-1 break-words sm:grid-cols-2" },
            h(
              "p",
              {},
              h("span", { class: "text-xs text-muted-foreground" }, "Yours: "),
              valueView(proposal.field, proposal.before),
            ),
            h(
              "p",
              {},
              h("span", { class: "text-xs text-muted-foreground" }, "Reference: "),
              valueView(proposal.field, proposal.after),
            ),
          ),
        ),
        h("div", { class: "flex shrink-0 gap-2" }, accept, reject),
      ),
      proposal.applicable
        ? null
        : h(
            "p",
            { class: "text-xs text-warning-text" },
            `${SOURCE_LABELS[proposal.source]} cannot store this field, so it is only shown.`,
          ),
    );
  }

  function valueView(
    field: ReferenceField,
    value: ReferenceProposal["before"],
  ): HTMLElement | string {
    if (field === "colors" && Array.isArray(value)) return colorChips(value);
    return displayValue(field, value);
  }

  function colorBlock(item: ReferenceItem): HTMLElement | null {
    const lines: Array<HTMLElement | null> = [];
    if (item.color) {
      const { color } = item;
      lines.push(
        h(
          "p",
          { class: "flex flex-wrap items-center gap-2" },
          swatch(color.spoolHex),
          h("span", { class: "text-xs" }, `#${color.spoolHex}`),
          h("span", { class: "text-xs text-muted-foreground" }, "against"),
          swatch(color.referenceHex),
          h("span", { class: "text-xs" }, `#${color.referenceHex}`),
          h(
            "span",
            {
              class: `rounded-full border px-2 py-0.5 text-xs ${color.verdict === "match" ? BADGE.safe : color.verdict === "close" ? BADGE.neutral : BADGE.review}`,
            },
            color.countDiffers
              ? "Different number of colors"
              : `${VERDICT[color.verdict]} (ΔE ${color.deltaE.toFixed(1)})`,
          ),
        ),
      );
    }
    const spoolHex = item.spoolNameHex;
    if (spoolHex?.state === "implausible")
      lines.push(
        h(
          "p",
          { class: "text-xs text-warning-text" },
          `Your color name points to ${spoolHex.nameFamilies.join(" or ")}, but the color code looks ${spoolHex.hexFamily.toLowerCase()}.`,
        ),
      );
    const refHex = item.referenceNameHex;
    if (refHex?.state === "implausible")
      lines.push(
        h(
          "p",
          { class: "text-xs text-warning-text" },
          `The reference's own color name points to ${refHex.nameFamilies.join(" or ")}, but its color code looks ${refHex.hexFamily.toLowerCase()}; check it before using its color.`,
        ),
      );
    const shown = lines.filter(Boolean);
    return shown.length ? h("div", { class: "mt-2 grid gap-1" }, ...shown) : null;
  }

  function candidateList(item: ReferenceItem): HTMLElement | null {
    if (!item.match.candidates.length) return null;
    const picked = item.selected?.reference.id;
    const none = item.chosen && !item.selected;
    const needs = !item.selected && !item.chosen;
    const rows = item.match.candidates.map((candidate) => {
      const use = h(
        "button",
        {
          type: "button",
          class: `${BUTTON} ${picked === candidate.reference.id ? PRESSED : ""}`,
          "aria-pressed": String(picked === candidate.reference.id),
          "data-key": `use-${item.spoolKey}-${candidate.reference.id}`,
        },
        picked === candidate.reference.id ? "In use" : "Use this",
      );
      const name = [
        candidate.reference.vendor,
        candidate.reference.material,
        candidate.reference.colorName ?? candidate.reference.name,
      ]
        .filter(Boolean)
        .join(" ");
      use.setAttribute("aria-label", `Use ${name} for ${item.spoolKey}`);
      use.addEventListener("click", () =>
        act(
          () => (controller.chooseReference(item.spoolKey, candidate.reference.id) ? 1 : 0),
          () => "Reference chosen",
        ),
      );
      return h(
        "li",
        {
          class: "flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs",
        },
        h(
          "span",
          { class: "flex min-w-0 flex-1 flex-wrap items-center gap-2" },
          swatch(candidate.reference.colorHex),
          h("span", { class: "font-medium text-foreground" }, name || candidate.reference.id),
          h(
            "span",
            { class: "text-muted-foreground" },
            `${candidate.score}% · ${candidate.reasons.join(", ")}`,
          ),
        ),
        use,
      );
    });
    const noneButton = h(
      "button",
      {
        type: "button",
        class: `${BUTTON} ${none ? PRESSED : ""}`,
        "aria-pressed": String(Boolean(none)),
        "data-key": `none-${item.spoolKey}`,
      },
      "None of these",
    );
    noneButton.addEventListener("click", () =>
      act(
        () => (controller.chooseReference(item.spoolKey, NO_REFERENCE) ? 1 : 0),
        () => "Marked as no match",
      ),
    );
    const reset = h(
      "button",
      { type: "button", class: BUTTON, "data-key": `auto-${item.spoolKey}` },
      "Back to automatic",
    );
    reset.addEventListener("click", () =>
      act(
        () => (controller.clearReference(item.spoolKey) ? 1 : 0),
        () => "Choice cleared",
      ),
    );
    reset.disabled = !item.chosen;
    return h(
      "details",
      { class: "mt-2 rounded-md border", ...(needs ? { open: "" } : {}) },
      h(
        "summary",
        {
          class:
            "cursor-pointer p-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary",
        },
        needs
          ? `Choose the matching record (${item.match.candidates.length})`
          : `Other matches (${item.match.candidates.length})`,
      ),
      h(
        "div",
        { class: "grid gap-2 px-2 pb-2" },
        item.match.note
          ? h("p", { class: "text-xs text-muted-foreground" }, item.match.note)
          : null,
        h("ul", { class: "grid gap-1" }, ...rows),
        h("div", { class: "flex flex-wrap gap-2" }, noneButton, reset),
      ),
    );
  }

  function statusBadge(item: ReferenceItem): HTMLElement {
    const selected = item.selected;
    const text = selected
      ? item.chosen
        ? "Chosen by you"
        : `Matched (${selected.confidence} confidence)`
      : item.chosen
        ? "No match (your choice)"
        : item.match.status === "ambiguous"
          ? "Needs a choice"
          : item.match.status === "suggested"
            ? "Partial match"
            : "No match";
    const tone = selected
      ? BADGE.safe
      : item.match.status === "none" || item.chosen
        ? BADGE.neutral
        : BADGE.review;
    return h("span", { class: `rounded-full border px-2 py-0.5 text-xs ${tone}` }, text);
  }

  function card(item: ReferenceItem, spools: Map<string, CommonSpool>): HTMLElement {
    const spool = spools.get(item.spoolKey);
    const label = spoolLabel(spool, item.spoolKey);
    const reference = item.selected?.reference;
    const same = item.diffs.filter((diff) => diff.status === "same").length;
    const withoutProposal = item.diffs.filter(
      (diff) => diff.status === "differs" && !item.proposals.some((p) => p.field === diff.field),
    );
    return h(
      "li",
      { class: "rounded-lg border p-3 text-sm", "data-spool": item.spoolKey },
      h(
        "div",
        { class: "flex flex-wrap items-start justify-between gap-2" },
        h(
          "div",
          { class: "min-w-0 flex-1" },
          h(
            "p",
            { class: "flex flex-wrap items-center gap-2 font-medium" },
            spool ? colorChips(spool.colors.slice(0, 1)) : null,
            label,
          ),
          h(
            "p",
            { class: "text-xs text-muted-foreground" },
            `${SOURCE_LABELS[item.source]} · ID ${item.sourceId}`,
          ),
        ),
        statusBadge(item),
      ),
      reference
        ? h(
            "p",
            { class: "mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" },
            swatch(reference.colorHex),
            h("span", {}, "Reference: "),
            h(
              "span",
              { class: "font-medium text-foreground" },
              [reference.vendor, reference.material, reference.colorName ?? reference.name]
                .filter(Boolean)
                .join(" ") || reference.id,
            ),
            reference.url
              ? h(
                  "a",
                  {
                    href: reference.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    class: "text-primary-text underline underline-offset-2 hover:no-underline",
                  },
                  "Source page",
                )
              : null,
          )
        : null,
      colorBlock(item),
      item.proposals.length
        ? h(
            "ul",
            { class: "mt-3 grid gap-2" },
            ...item.proposals.map((proposal) => proposalRow(proposal, label)),
          )
        : null,
      withoutProposal.length
        ? h(
            "p",
            { class: "mt-2 text-xs text-muted-foreground" },
            `Differs from the reference but is kept (overwrite is off): ${withoutProposal.map((diff) => FIELD_LABELS[diff.field]).join(", ")}.`,
          )
        : null,
      reference && same
        ? h(
            "p",
            { class: "mt-2 text-xs text-muted-foreground" },
            `${plural(same, "field")} already agree${same === 1 ? "s" : ""} with the reference.`,
          )
        : null,
      candidateList(item),
    );
  }

  function resultsSection(): HTMLElement {
    const counts = controller.counts();
    const filterCounts = controller.filterCounts();
    const chips = FILTERS.map(([filter, text]) => {
      const chip = h(
        "button",
        {
          type: "button",
          class: `${BUTTON} ${controller.filter === filter ? PRESSED : ""}`,
          "aria-pressed": String(controller.filter === filter),
          "data-key": `filter-${filter}`,
        },
        `${text} (${filterCounts[filter]})`,
      );
      chip.addEventListener("click", () => {
        controller.setFilter(filter as ReferenceFilter);
        limit = PAGE;
        draw();
        focusKey(`filter-${filter}`);
      });
      return chip;
    });
    const fill = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "fill-missing" },
      "Fill all missing",
    );
    const fillable = controller
      .visible()
      .flatMap((item) => item.proposals)
      .filter((p) => p.kind === "fill" && p.applicable && controller.status(p) === "pending");
    fill.disabled = fillable.length === 0;
    fill.addEventListener("click", () =>
      act(
        () => controller.fillAllMissing(),
        (count) => `Accepted ${plural(count, "missing value")}`,
      ),
    );
    const overwritable = controller
      .visible()
      .flatMap((item) => item.proposals)
      .filter((p) => p.kind === "overwrite" && p.applicable && controller.status(p) === "pending");
    const overwrite = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "overwrite-selected" },
      "Overwrite selected",
    );
    overwrite.disabled = overwritable.length === 0;
    overwrite.title =
      "Accepts every undecided overwrite in view, for the fields that allow overwriting";
    overwrite.addEventListener("click", () =>
      act(
        () => controller.overwriteSelected(),
        (count) => `Accepted ${plural(count, "overwrite")}`,
      ),
    );
    const clear = h(
      "button",
      { type: "button", class: BUTTON, "data-key": "clear-choices" },
      "Clear choices",
    );
    clear.disabled = counts.accepted + counts.rejected === 0;
    clear.addEventListener("click", () =>
      act(
        () => controller.clearChoices(),
        (count) => `Cleared ${plural(count, "choice")}`,
      ),
    );
    const undo = h("button", { type: "button", class: BUTTON, "data-key": "undo" }, "Undo");
    const undoLabel = controller.undoLabel();
    undo.disabled = !undoLabel;
    if (undoLabel) undo.setAttribute("aria-label", `Undo ${undoLabel}`);
    undo.addEventListener("click", () =>
      act(
        () => (controller.undo() ? 1 : 0),
        () => "Undone",
      ),
    );

    const items = controller.visible();
    const spools = spoolIndex();
    const shown = items.slice(0, limit);
    const more = h(
      "button",
      { type: "button", class: `${BUTTON} mt-3`, "data-key": "show-more" },
      `Show ${Math.min(PAGE, items.length - limit)} more (${items.length - limit} not shown)`,
    );
    more.addEventListener("click", () => {
      limit += PAGE;
      draw();
    });

    return h(
      "section",
      { class: "mt-4" },
      h(
        "p",
        { class: "text-sm", "aria-live": "polite" },
        `${plural(counts.spools, "spool")}: ${counts.matched} matched, ${counts.ambiguous + counts.suggested} need a choice, ${counts.unmatched} without a match. ` +
          `${plural(counts.proposals, "suggestion")} (${counts.safe} safe, ${counts.review} to review); ${counts.accepted} accepted, ${counts.rejected} rejected, ${counts.pending} undecided.` +
          (counts.notApplicable
            ? ` ${counts.notApplicable} cannot be stored by their service.`
            : "") +
          (counts.colorMismatches
            ? ` ${plural(counts.colorMismatches, "color")} ${counts.colorMismatches === 1 ? "does" : "do"} not match the reference.`
            : ""),
      ),
      controller.dropped
        ? h(
            "p",
            { class: "mt-1 text-xs text-muted-foreground" },
            `${plural(controller.dropped, "earlier choice")} no longer matched the loaded data and was dropped.`,
          )
        : null,
      h(
        "div",
        {
          class: "mt-3 flex flex-wrap items-center gap-2",
          role: "group",
          "aria-label": "Filter spools",
        },
        ...chips,
      ),
      h("div", { class: "mt-3 flex flex-wrap items-center gap-2" }, fill, overwrite, clear, undo),
      items.length
        ? h("ul", { class: "mt-3 grid gap-3" }, ...shown.map((item) => card(item, spools)))
        : h(
            "p",
            { class: "mt-3 text-sm text-muted-foreground" },
            counts.spools
              ? controller.filter === "all"
                ? "Nothing to review: everything that matched agrees with the reference."
                : "No spools match this filter."
              : "Load an inventory to compare it with the reference.",
          ),
      items.length > limit ? h("div", {}, more) : null,
      counts.accepted
        ? h(
            "p",
            { class: "mt-4 text-sm" },
            `${plural(counts.accepted, "accepted change")} will appear in the plan on the Sync page. `,
            h(
              "a",
              {
                href: "/sync",
                class:
                  "font-medium text-primary-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary",
              },
              "Go to Sync",
            ),
          )
        : null,
    );
  }

  function draw(): void {
    const held = controller.heldCount();
    setChildren(
      content,
      h(
        "p",
        { class: "text-sm text-muted-foreground" },
        "Matches your spools to a reference catalog of filaments, then shows what it could fill in (missing temperatures, weights, barcodes, colors) or correct, with colors compared side by side. Nothing changes until you accept it, and accepted changes are only planned: the Sync page lists each one before anything is written. Spools that fit several records are never matched for you.",
      ),
      sourceSection(),
      catalogSection(),
      controller.catalog ? policySection() : null,
      controller.catalog
        ? resultsSection()
        : h(
            "p",
            { class: "mt-4 text-sm text-muted-foreground" },
            held
              ? `${plural(held, "accepted change")} from an earlier visit ${held === 1 ? "is" : "are"} kept. Load the same reference again to review ${held === 1 ? "it" : "them"}.`
              : "Load a reference file, or fetch a catalog, to start.",
          ),
    );
  }

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    limit = PAGE;
    draw();
  });

  return {
    update() {
      root.hidden = results.size === 0;
      controller.refresh();
      summary.textContent = summaryText();
      if (details.open && !root.hidden) draw();
    },
    open() {
      root.hidden = results.size === 0;
      details.open = true;
    },
    controller,
  };
}
