import { local, read, write } from "~/lib/browser/storage/access";
import {
  CHANGELOG_PAGE_URL,
  CHANGELOG_URL,
  findRelease,
  isOlderThanLatest,
  parseChangelog,
  type ChangelogRelease,
} from "~/lib/changelog";

import { h, showToast } from "./dom";

const CACHE_KEY = "spoolsync:changelog-cache";
const SEEN_KEY = "spoolsync:last-seen-version";
const MAX_RELEASES = 8;
const FETCH_TIMEOUT_MS = 8000;

let dialog: HTMLDialogElement | undefined;
let content: HTMLElement | undefined;

interface CachedChangelog {
  text: string;
  fetchedAt: string;
}

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
      class: `underline hover:no-underline ${extra}`.trim(),
    },
    label,
  );

function renderRelease(release: ChangelogRelease, current: string): HTMLElement {
  const heading = release.url
    ? link(release.url, `v${release.version}`)
    : h("span", {}, `v${release.version}`);
  return h(
    "section",
    {
      class: "border-t py-4 first:border-t-0 first:pt-0",
      "aria-label": `Version ${release.version}`,
    },
    h(
      "h3",
      { class: "flex flex-wrap items-baseline gap-2 text-base font-bold" },
      heading,
      release.date
        ? h("span", { class: "text-xs font-normal text-muted-foreground" }, release.date)
        : null,
      release.version === current
        ? h(
            "span",
            {
              class: "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary-text",
            },
            "You are here",
          )
        : null,
    ),
    ...release.sections.map((section) =>
      h(
        "div",
        { class: "mt-2" },
        h(
          "h4",
          { class: "text-xs font-semibold uppercase tracking-wide text-muted-foreground" },
          section.title,
        ),
        h(
          "ul",
          { class: "mt-1 space-y-1 text-sm" },
          ...section.items.map((item) =>
            h(
              "li",
              { class: "flex flex-wrap items-baseline gap-x-1.5" },
              item.scope
                ? h(
                    "span",
                    {
                      class:
                        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground",
                    },
                    item.scope,
                  )
                : null,
              h("span", {}, item.text),
              ...item.commits.map((commit) =>
                commit.url
                  ? link(
                      commit.url,
                      commit.hash.slice(0, 7),
                      "font-mono text-xs text-muted-foreground",
                    )
                  : h(
                      "span",
                      { class: "font-mono text-xs text-muted-foreground" },
                      commit.hash.slice(0, 7),
                    ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function render(text: string, current: string, note: string | null): void {
  if (!content) return;
  const releases = parseChangelog(text);
  const shown = releases.slice(0, MAX_RELEASES);
  const known = findRelease(releases, current);
  const status = !known
    ? `Version ${current} is not in the changelog yet, so it includes changes that have not been released.`
    : isOlderThanLatest(releases, current)
      ? `A newer version, ${releases[0]!.version}, is available. Reload the page to get it.`
      : null;
  content.replaceChildren(
    ...[note, status]
      .filter(Boolean)
      .map((message) =>
        h(
          "p",
          { class: "mb-3 rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground" },
          message,
        ),
      ),
    shown.length
      ? h("div", {}, ...shown.map((release) => renderRelease(release, current)))
      : h("p", { class: "text-sm text-muted-foreground" }, "The changelog has no releases yet."),
    h(
      "p",
      { class: "mt-4 text-xs" },
      link(
        CHANGELOG_PAGE_URL,
        releases.length > shown.length
          ? "See all releases on GitHub"
          : "Open the changelog on GitHub",
      ),
    ),
  );
}

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  content = h("div", { id: "changelog-content", "aria-live": "polite" });
  const close = h(
    "button",
    {
      type: "button",
      class:
        "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
    },
    "Close",
  );
  dialog = h(
    "dialog",
    {
      id: "changelog-dialog",
      closedby: "any",
      class:
        "m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
      "aria-labelledby": "changelog-title",
    },
    h(
      "div",
      { class: "p-6" },
      h("h2", { id: "changelog-title", class: "text-xl font-bold tracking-tight" }, "What's new"),
      h(
        "p",
        { class: "mb-4 mt-1 text-xs text-muted-foreground" },
        "Read from SpoolSync's changelog on GitHub.",
      ),
      content,
      h("div", { class: "mt-5 flex justify-end" }, close),
    ),
  );
  close.addEventListener("click", () => dialog?.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
  document.body.append(dialog);
  return dialog;
}

/** Opens the changelog: shows what was saved last time at once, then refreshes it from GitHub. */
export async function openChangelog(current: string): Promise<void> {
  const element = ensureDialog();
  const cached = readCache();
  if (cached) render(cached.text, current, null);
  else
    content?.replaceChildren(
      h("p", { class: "text-sm text-muted-foreground" }, "Loading the changelog…"),
    );
  if (!element.open) element.showModal();
  write(local, SEEN_KEY, current);
  try {
    render(await fetchChangelog(), current, null);
  } catch (error) {
    const reason =
      error instanceof Error && error.name !== "AbortError"
        ? error.message
        : "It took too long to answer.";
    if (cached)
      render(
        cached.text,
        current,
        `Could not reach GitHub (${reason}) Showing the copy saved on ${new Date(cached.fetchedAt).toLocaleDateString()}.`,
      );
    else
      content?.replaceChildren(
        h(
          "p",
          { id: "changelog-error", class: "text-sm" },
          `Could not load the changelog (${reason}) `,
          link(CHANGELOG_PAGE_URL, "Open it on GitHub"),
          ".",
        ),
      );
  }
}

/** Wires every "[data-open-changelog]" control, which carries the running version. */
export function wireChangelog(): void {
  for (const trigger of document.querySelectorAll<HTMLElement>("[data-open-changelog]"))
    trigger.addEventListener("click", () => void openChangelog(trigger.dataset["version"] ?? ""));
}

/**
 * Says so once, the first time the page loads after the version changed. A first-ever visit just
 * records the version, so nobody is told about an "update" they never had.
 */
export function announceUpdate(current: string): void {
  if (!current) return;
  const seen = read(local, SEEN_KEY);
  if (seen === current) return;
  write(local, SEEN_KEY, current);
  if (seen)
    showToast(
      `SpoolSync updated to v${current}. Click the version in the footer to see what's new.`,
      "info",
      9000,
    );
}
