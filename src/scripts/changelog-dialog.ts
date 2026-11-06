import { local, read, write } from "~/lib/browser/storage/access";
import {
  CHANGELOG_PAGE_URL,
  CHANGELOG_URL,
  SECTION_KIND_LABELS,
  countItems,
  filterReleases,
  findRelease,
  isOlderThanLatest,
  parseChangelog,
  presentKinds,
  releasesSince,
  sectionKind,
  shortHash,
  type ChangelogRelease,
  type SectionKind,
} from "~/lib/changelog";

import { READ_KEY, SEEN_KEY } from "./changelog-announce";
import { h } from "./dom";

const CACHE_KEY = "spoolsync:changelog-cache";
/** Releases drawn in the dialog; older ones are one link away on GitHub. */
const MAX_RELEASES = 20;
/** The newest releases start expanded; the rest are collapsed so the list stays scannable. */
const OPEN_BY_DEFAULT = 2;
const FETCH_TIMEOUT_MS = 8000;
const SVG_NS = "http://www.w3.org/2000/svg";

/** 24 by 24 stroke icons, one per kind of change, so a section never relies on color alone. */
const KIND_ICONS: Record<SectionKind, string> = {
  breaking: "M12 3 2.5 20h19L12 3z M12 10v4 M12 17v.01",
  features:
    "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M18 6l-2.5 2.5 M8.5 15.5 6 18",
  fixes:
    "M8 9h8v6a4 4 0 0 1-8 0V9z M9 9a3 3 0 0 1 6 0 M4 12h4 M16 12h4 M5 7l3 2 M19 7l-3 2 M5 19l3-2 M19 19l-3-2",
  performance: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  docs: "M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h7",
  maintenance:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
  other: "M5 7h.01 M9 7h10 M5 12h.01 M9 12h10 M5 17h.01 M9 17h10",
};
const CLOSE_ICON = "M6 6l12 12 M18 6 6 18";

function icon(path: string, extra = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `cl-icon ${extra}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

interface CachedChangelog {
  text: string;
  fetchedAt: string;
}

interface Elements {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  sub: HTMLElement;
  badge: HTMLElement;
  search: HTMLInputElement;
  chips: HTMLElement;
  scroller: HTMLElement;
  nav: HTMLElement;
  content: HTMLElement;
}

interface ViewState {
  releases: ChangelogRelease[];
  current: string;
  /** The version the visitor last opened the changelog at, read before this visit overwrote it. */
  seen: string | null;
  kinds: Set<SectionKind>;
  query: string;
  note: string | null;
}

let elements: Elements | undefined;
let opener: HTMLElement | null = null;
let view: ViewState | undefined;
let observer: IntersectionObserver | undefined;
let requestId = 0;

function readCache(): CachedChangelog | null {
  try {
    const parsed = JSON.parse(read(local, CACHE_KEY) ?? "null") as Partial<CachedChangelog> | null;
    return parsed && typeof parsed.text === "string" && typeof parsed.fetchedAt === "string"
      ? { text: parsed.text, fetchedAt: parsed.fetchedAt }
      : null;
  } catch {
    return null;
  }
}

/** Fetches the changelog from GitHub, giving up after a few seconds so the dialog never hangs. */
async function fetchChangelog(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(CHANGELOG_URL, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
    const text = await response.text();
    write(local, CACHE_KEY, JSON.stringify({ text, fetchedAt: new Date().toISOString() }));
    return text;
  } finally {
    clearTimeout(timer);
  }
}

const link = (href: string, label: string, extra = "") =>
  h(
    "a",
    {
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      class: `cl-link ${extra}`.trim(),
    },
    label,
  );

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function renderRelease(
  release: ChangelogRelease,
  index: number,
  state: ViewState,
  open: boolean,
  isNew: boolean,
): HTMLElement {
  const total = countItems(release);
  const summary = h(
    "summary",
    { class: "cl-release-summary" },
    h(
      "h3",
      { class: "cl-release-title" },
      h("span", { class: "cl-version" }, `v${release.version}`),
      release.date
        ? h("time", { class: "cl-date", datetime: release.date }, formatDate(release.date))
        : null,
    ),
    h(
      "span",
      { class: "cl-release-meta" },
      isNew ? h("span", { class: "cl-pill cl-pill-new" }, "New") : null,
      release.version === state.current
        ? h("span", { class: "cl-pill cl-pill-current" }, "You are here")
        : null,
      h("span", { class: "cl-count" }, `${total} ${total === 1 ? "change" : "changes"}`),
    ),
    icon("M6 9l6 6 6-6", "cl-chevron"),
  );
  return h(
    "details",
    {
      class: "cl-release",
      id: `cl-release-${index}`,
      "data-index": String(index),
      ...(open ? { open: "" } : {}),
    },
    summary,
    h(
      "div",
      { class: "cl-release-body" },
      ...release.sections.map((section) => renderSection(section, release)),
      release.url
        ? h("p", { class: "cl-compare" }, link(release.url, "Compare changes on GitHub"))
        : null,
    ),
  );
}

function renderSection(section: ChangelogRelease["sections"][number], release: ChangelogRelease) {
  const kind = sectionKind(section.title);
  return h(
    "section",
    {
      class: "cl-section",
      "data-kind": kind,
      "aria-label": `${section.title}, version ${release.version}`,
    },
    h(
      "h4",
      { class: "cl-section-title" },
      icon(KIND_ICONS[kind]),
      h("span", {}, section.title),
      h("span", { class: "cl-section-count" }, String(section.items.length)),
    ),
    h(
      "ul",
      { class: "cl-items" },
      ...section.items.map((item) =>
        h(
          "li",
          { class: "cl-item" },
          item.scope ? h("span", { class: "cl-scope" }, item.scope) : null,
          h("span", { class: "cl-text" }, item.text),
          item.commits.length
            ? h(
                "span",
                { class: "cl-commits" },
                ...item.commits.map((commit) =>
                  commit.url
                    ? h(
                        "a",
                        {
                          href: commit.url,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          class: "cl-hash",
                          "aria-label": `Commit ${shortHash(commit.hash)} on GitHub`,
                        },
                        shortHash(commit.hash),
                      )
                    : h("span", { class: "cl-hash" }, shortHash(commit.hash)),
                ),
              )
            : null,
        ),
      ),
    ),
  );
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function setActiveNav(index: number | null): void {
  if (!elements) return;
  for (const chip of elements.nav.querySelectorAll<HTMLElement>("[data-target]")) {
    const active = Number(chip.dataset["target"]) === index;
    if (active) {
      chip.setAttribute("aria-current", "true");
      // Keep the active chip in view when the list of chips scrolls sideways.
      const { nav } = elements;
      const left = chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2;
      nav.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
    } else chip.removeAttribute("aria-current");
  }
}

function jumpTo(index: number): void {
  if (!elements) return;
  const target = elements.content.querySelector<HTMLDetailsElement>(`#cl-release-${index}`);
  if (!target) return;
  target.open = true;
  target.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  setActiveNav(index);
  target.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
}

function observeReleases(): void {
  observer?.disconnect();
  observer = undefined;
  if (!elements || typeof IntersectionObserver === "undefined") return;
  const visible = new Set<number>();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset["index"]);
        if (entry.isIntersecting) visible.add(index);
        else visible.delete(index);
      }
      if (visible.size) setActiveNav(Math.min(...visible));
    },
    { root: elements.scroller, rootMargin: "0px 0px -65% 0px", threshold: 0 },
  );
  for (const release of elements.content.querySelectorAll(".cl-release")) observer.observe(release);
}

function renderChips(releases: readonly ChangelogRelease[]): void {
  if (!elements || !view) return;
  const kinds = presentKinds(releases);
  elements.chips.replaceChildren(
    ...kinds.map((kind) => {
      const chip = h(
        "button",
        {
          type: "button",
          class: "cl-chip",
          "data-kind": kind,
          "aria-pressed": String(view!.kinds.has(kind)),
        },
        icon(KIND_ICONS[kind]),
        SECTION_KIND_LABELS[kind],
      );
      chip.addEventListener("click", () => {
        if (!view) return;
        if (view.kinds.has(kind)) view.kinds.delete(kind);
        else view.kinds.add(kind);
        chip.setAttribute("aria-pressed", String(view.kinds.has(kind)));
        renderList();
      });
      return chip;
    }),
  );
  elements.chips.hidden = kinds.length < 2;
}

function updateBadge(): void {
  if (!elements || !view) return;
  const news = releasesSince(view.releases, view.seen);
  elements.badge.className = news.length ? "cl-badge cl-badge-new" : "cl-badge";
  elements.badge.textContent = news.length
    ? `${news.length} new since v${view.seen}`
    : view.releases.length
      ? "You are up to date"
      : "";
  elements.badge.hidden = !elements.badge.textContent;
}

/** Draws the (filtered) release list and the jump chips from the current view state. */
function renderList(): void {
  if (!elements || !view) return;
  const { content, nav } = elements;
  const all = view.releases.slice(0, MAX_RELEASES);
  const filtering = view.kinds.size > 0 || view.query.trim() !== "";
  const shown = filterReleases(all, { kinds: view.kinds, query: view.query });
  const known = findRelease(view.releases, view.current);
  const newVersions = new Set(releasesSince(view.releases, view.seen).map((r) => r.version));
  const status = !view.releases.length
    ? null
    : !known
      ? `Version ${view.current} is not in the changelog yet, so it includes changes that have not been released.`
      : isOlderThanLatest(view.releases, view.current)
        ? `A newer version, ${view.releases[0]!.version}, is available. Reload the page to get it.`
        : null;

  content.setAttribute("aria-busy", "false");
  const parts: Node[] = [];
  for (const message of [view.note, status])
    if (message) parts.push(h("p", { class: "cl-note", role: "status" }, message));
  if (shown.length) {
    parts.push(
      ...shown.map((release, index) =>
        renderRelease(
          release,
          index,
          view!,
          filtering || index < OPEN_BY_DEFAULT,
          newVersions.has(release.version),
        ),
      ),
    );
  } else if (view.releases.length) {
    const clear = h("button", { type: "button", class: "cl-button" }, "Clear search and filters");
    clear.addEventListener("click", () => {
      if (!view || !elements) return;
      view.kinds.clear();
      view.query = "";
      elements.search.value = "";
      for (const chip of elements.chips.querySelectorAll("[aria-pressed]"))
        chip.setAttribute("aria-pressed", "false");
      renderList();
      elements.search.focus();
    });
    parts.push(
      h(
        "div",
        { class: "cl-empty" },
        h("p", {}, "No changes match."),
        h("p", { class: "cl-muted" }, "Try a different word or turn off a type filter."),
        clear,
      ),
    );
  } else {
    parts.push(h("p", { class: "cl-empty" }, "The changelog has no releases yet."));
  }
  parts.push(
    h(
      "p",
      { class: "cl-footer" },
      link(
        CHANGELOG_PAGE_URL,
        view.releases.length > all.length
          ? "See all releases on GitHub"
          : "Open the changelog on GitHub",
      ),
    ),
  );
  content.replaceChildren(...parts);

  nav.replaceChildren(
    ...shown.map((release, index) => {
      const chip = h(
        "button",
        {
          type: "button",
          class: "cl-nav-chip",
          "data-target": String(index),
          "aria-label": `Jump to version ${release.version}`,
        },
        `v${release.version}`,
      );
      chip.addEventListener("click", () => jumpTo(index));
      return chip;
    }),
  );
  nav.hidden = shown.length < 2;
  if (shown.length) setActiveNav(0);
  elements.scroller.scrollTop = 0;
  observeReleases();
  updateBadge();
}

function showSkeleton(): void {
  if (!elements) return;
  elements.content.setAttribute("aria-busy", "true");
  elements.nav.hidden = true;
  elements.badge.hidden = true;
  elements.content.replaceChildren(
    h("p", { class: "sr-only", role: "status" }, "Loading the changelog…"),
    ...[0, 1].map(() =>
      h(
        "div",
        { class: "cl-skeleton", "aria-hidden": "true" },
        h("span", { class: "cl-skel-line cl-skel-title" }),
        h("span", { class: "cl-skel-line" }),
        h("span", { class: "cl-skel-line" }),
        h("span", { class: "cl-skel-line cl-skel-short" }),
      ),
    ),
  );
}

function showError(reason: string): void {
  if (!elements) return;
  elements.content.setAttribute("aria-busy", "false");
  elements.nav.hidden = true;
  elements.badge.hidden = true;
  elements.chips.hidden = true;
  const retry = h("button", { type: "button", class: "cl-button cl-button-primary" }, "Try again");
  retry.addEventListener("click", () => void load());
  elements.content.replaceChildren(
    h(
      "div",
      { id: "changelog-error", class: "cl-error", role: "alert" },
      h("p", { class: "cl-error-title" }, "Could not load the changelog"),
      h("p", { class: "cl-muted" }, reason),
      h(
        "div",
        { class: "cl-error-actions" },
        retry,
        link(CHANGELOG_PAGE_URL, "Open it on GitHub", "cl-link-button"),
      ),
    ),
  );
  retry.focus();
}

function show(text: string, note: string | null): void {
  if (!view) return;
  view.releases = parseChangelog(text);
  view.note = note;
  renderChips(view.releases.slice(0, MAX_RELEASES));
  renderList();
}

function describeFailure(error: unknown): string {
  return error instanceof Error && error.name !== "AbortError"
    ? error.message
    : "It took too long to answer.";
}

/** Shows the saved copy at once when there is one, then refreshes it from GitHub. */
async function load(): Promise<void> {
  if (!view) return;
  const id = ++requestId;
  const cached = readCache();
  if (cached) show(cached.text, null);
  else showSkeleton();
  try {
    const text = await fetchChangelog();
    if (id === requestId) show(text, null);
  } catch (error) {
    if (id !== requestId) return;
    const reason = describeFailure(error);
    if (cached)
      show(
        cached.text,
        `Could not reach GitHub (${reason}) Showing the copy saved on ${new Date(cached.fetchedAt).toLocaleDateString()}.`,
      );
    else showError(reason);
  }
}

function ensureDialog(): Elements {
  if (elements) return elements;
  const title = h(
    "h2",
    { id: "changelog-title", class: "cl-heading", tabindex: "-1" },
    "What's new",
  );
  const sub = h(
    "p",
    { id: "changelog-sub", class: "cl-sub" },
    "Read from SpoolSync's changelog on GitHub.",
  );
  const badge = h("span", { class: "cl-badge", role: "status" });
  const close = h(
    "button",
    { type: "button", class: "cl-close", "aria-label": "Close changelog" },
    icon(CLOSE_ICON),
  );
  const search = h("input", {
    id: "changelog-search",
    type: "search",
    class: "cl-search",
    placeholder: "Search changes",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search the changelog",
  });
  const chips = h("div", {
    class: "cl-chips",
    role: "group",
    "aria-label": "Show only these types of change",
    hidden: "",
  });
  const nav = h("nav", { class: "cl-nav", "aria-label": "Jump to a release", hidden: "" });
  const content = h("div", { id: "changelog-content", class: "cl-content", "aria-live": "polite" });
  const scroller = h(
    "div",
    {
      class: "cl-scroll",
      tabindex: "0",
      role: "region",
      "aria-label": "Release notes",
    },
    nav,
    content,
  );
  const dialog = h(
    "dialog",
    {
      id: "changelog-dialog",
      class: "cl-dialog",
      closedby: "any",
      "aria-labelledby": "changelog-title",
      "aria-describedby": "changelog-sub",
    },
    h(
      "div",
      { class: "cl-shell" },
      h(
        "header",
        { class: "cl-header" },
        h("span", { class: "cl-grabber", "aria-hidden": "true" }),
        h("div", { class: "cl-titlebar" }, h("div", { class: "cl-titles" }, title, sub), close),
        h("div", { class: "cl-status" }, badge),
        h("div", { class: "cl-tools" }, search, chips),
      ),
      scroller,
    ),
  );
  elements = { dialog, title, sub, badge, search, chips, scroller, nav, content };
  close.addEventListener("click", () => dialog.close());
  // Browsers without `closedby` still close when the backdrop is clicked.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    requestId += 1;
    observer?.disconnect();
    observer = undefined;
    const target = opener;
    opener = null;
    if (target?.isConnected) target.focus();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!view) return;
      view.query = search.value;
      renderList();
    }, 120);
  });
  document.body.append(dialog);
  return elements;
}

/** Opens the changelog: shows what was saved last time at once, then refreshes it from GitHub. */
export async function openChangelog(current: string): Promise<void> {
  const parts = ensureDialog();
  if (!parts.dialog.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  view = {
    releases: [],
    current,
    seen: read(local, READ_KEY),
    kinds: new Set(),
    query: "",
    note: null,
  };
  parts.search.value = "";
  parts.chips.replaceChildren();
  parts.chips.hidden = true;
  if (!parts.dialog.open) parts.dialog.showModal();
  parts.title.focus({ preventScroll: true });
  write(local, SEEN_KEY, current);
  write(local, READ_KEY, current);
  await load();
}
