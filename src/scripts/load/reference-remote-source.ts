import {
  buildFetchConfig,
  defaultProviderSettings,
  FETCH_LIMITS,
  providerById,
  type Pagination,
  type ProviderSettings,
  type ReferenceProviderId,
} from "@spoolsync/core/core/reference";

import { h } from "../dom";
import { plural } from "./presentation";
import type { PanelContext } from "./reference-context";
import type { CatalogInfo } from "./reference-controller";
import { PAGE, BUTTON, INPUT, labelled, numberInput, textInput } from "./reference-widgets";

function draftFor(ctx: PanelContext, id: ReferenceProviderId): ProviderSettings {
  let draft = ctx.state.drafts.get(id);
  if (!draft) {
    draft = structuredClone(ctx.controller.settings.providers[id] ?? defaultProviderSettings(id));
    ctx.state.drafts.set(id, draft);
  }
  return draft;
}

export function paginationControls(
  ctx: PanelContext,
  draft: ProviderSettings,
  id: string,
): HTMLElement {
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
    ctx.draw();
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
export function fetchedText(info: CatalogInfo): string {
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

export function remoteSource(ctx: PanelContext, id: ReferenceProviderId): HTMLElement {
  const provider = providerById(id)!;
  const draft = draftFor(ctx, id);
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
    ctx.state.settingsErrors = checked.ok ? [] : checked.errors;
    if (checked.ok) {
      ctx.controller.saveProviderSettings(id, structuredClone(draft));
      ctx.state.sourceMessage = { tone: "info", text: "Settings saved." };
    }
    ctx.draw();
  });
  const fetchNow = (force: boolean) => async () => {
    const checked = buildFetchConfig(id, draft);
    if (!checked.ok) {
      ctx.state.settingsErrors = checked.errors;
      ctx.draw();
      return;
    }
    ctx.controller.saveProviderSettings(id, structuredClone(draft));
    ctx.state.settingsErrors = [];
    ctx.state.sourceMessage = { tone: "info", text: "Fetching…" };
    ctx.draw();
    const outcome = await ctx.controller.fetchProvider(id, {
      force,
      onProgress: (progress) => {
        ctx.state.sourceMessage = {
          tone: "info",
          text: `Fetching… ${plural(progress.pages, "page")}, ${plural(progress.records, "record")}.`,
        };
        const line = ctx.content.querySelector("#reference-source-message");
        if (line) line.textContent = ctx.state.sourceMessage.text;
      },
    });
    if (outcome.kind === "stale") return;
    if (outcome.kind === "ok") {
      const { info } = outcome;
      ctx.state.sourceMessage = {
        tone:
          info.warnings.length || (info.note && !info.note.startsWith("Checked"))
            ? "warning"
            : "info",
        text: [fetchedText(info), info.note].filter(Boolean).join(" "),
      };
      ctx.state.limit = PAGE;
    } else if (outcome.kind === "invalid") {
      ctx.state.settingsErrors = outcome.errors;
      ctx.state.sourceMessage = null;
    } else {
      ctx.state.sourceMessage = {
        tone: outcome.cancelled ? "info" : "error",
        text: outcome.cancelled ? "Fetch cancelled." : outcome.message,
      };
    }
    ctx.refreshSummary();
    ctx.draw();
  };
  const fetchButton = h(
    "button",
    { type: "button", class: BUTTON, "data-key": `fetch-${id}` },
    "Fetch",
  );
  fetchButton.disabled = ctx.controller.busy;
  fetchButton.addEventListener("click", () => void fetchNow(false)());
  const refetch = h(
    "button",
    { type: "button", class: BUTTON, "data-key": `refetch-${id}` },
    "Fetch again",
  );
  refetch.disabled = ctx.controller.busy;
  refetch.addEventListener("click", () => void fetchNow(true)());
  const cancel = h(
    "button",
    { type: "button", class: BUTTON, "data-key": `cancel-${id}` },
    "Cancel",
  );
  cancel.disabled = !ctx.controller.busy;
  cancel.addEventListener("click", () => {
    ctx.controller.cancel();
    ctx.state.sourceMessage = { tone: "info", text: "Fetch cancelled." };
    ctx.draw();
  });
  const clear = h(
    "button",
    { type: "button", class: BUTTON, "data-key": `clear-cache-${id}` },
    "Clear cached copy",
  );
  clear.disabled = !ctx.store.loadCache()[id];
  clear.addEventListener("click", () => {
    void ctx.store.clearCache(id).then(() => {
      ctx.state.sourceMessage = { tone: "info", text: "Cached copy removed." };
      ctx.draw();
    });
  });
  const cached = ctx.controller.cached(id);

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
    paginationControls(ctx, draft, prefix),
    h(
      "div",
      { class: "grid gap-2 sm:grid-cols-3" },
      labelled("Keep fetched data for (hours, 0 = always fetch)", `${prefix}-ttl`, ttl),
      labelled("Pause between requests (ms)", `${prefix}-interval`, interval),
      labelled("Credit line (optional)", `${prefix}-credit`, credit),
    ),
    ctx.state.settingsErrors.length
      ? h(
          "ul",
          { class: "list-disc pl-5 text-xs text-error-text", role: "alert" },
          ...ctx.state.settingsErrors.map((error) => h("li", {}, error)),
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
