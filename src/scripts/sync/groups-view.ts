import type { SpoolGroup } from "@spoolsync/core/core/match";
import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { updatePreferences } from "~/lib/preferences";

import { byId, focusRevealedItem, h } from "../dom";
import { wireEscapeClear, wireSlashFocus } from "../shortcuts";
import { createGroupCards } from "./group-card";
import { button } from "./presentation";
import type { SyncSession } from "./session";

export function createGroupsView(
  state: SyncSession,
  onChanged: () => void,
  onFilterReset?: () => void,
) {
  const { groupCard, hasContent } = createGroupCards(state, onChanged);

  const PAGE_SIZE = 25;
  const SHOW_ALL_BATCH = 100;
  let renderToken = 0;
  let shown = PAGE_SIZE;
  let lastFilter = state.filter;
  let query = "";
  let pendingFocusIndex: number | null = null;

  const searchCache = new WeakMap<SpoolGroup, string>();
  function searchText(group: SpoolGroup): string {
    const cached = searchCache.get(group);
    if (cached !== undefined) return cached;
    const text = SOURCE_IDS.flatMap((source) => {
      const spool = group.members[source];
      return spool
        ? [spool.vendor, spool.material, spool.name, spool.sourceId, spool.location, spool.upc]
        : [];
    })
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    searchCache.set(group, text);
    return text;
  }

  function matchingGroups(): SpoolGroup[] {
    const needle = query.trim().toLowerCase();
    return state
      .visibleGroups()
      .filter((group) => !needle || searchText(group).includes(needle))
      .filter(hasContent);
  }

  function renderGroups(): void {
    if (state.filter !== lastFilter) {
      lastFilter = state.filter;
      shown = PAGE_SIZE;
    }
    const needle = query.trim().toLowerCase();
    const groups = state
      .visibleGroups()
      .filter((group) => !needle || searchText(group).includes(needle));
    // Build cards only for the visible window so very large inventories stay responsive. "Show all"
    // builds a first batch now and appends the rest a batch per frame, so the page never freezes.
    renderToken++;
    const token = renderToken;
    const cards: HTMLElement[] = [];
    const eligible = groups.filter(hasContent);
    const candidates = eligible.length;
    const chunked =
      shown === Number.POSITIVE_INFINITY && typeof requestAnimationFrame === "function";
    const limit = chunked ? SHOW_ALL_BATCH : shown;
    let next = 0;
    const buildCards = (count: number): HTMLElement[] => {
      const built: HTMLElement[] = [];
      while (next < eligible.length && built.length < count) {
        const card = groupCard(eligible[next++]!);
        if (card) built.push(card);
      }
      return built;
    };
    cards.push(...buildCards(limit));
    const pending = chunked && next < eligible.length;
    const hidden = pending ? 0 : candidates - cards.length;
    const emptyMessage = needle
      ? `No spools matching "${query.trim()}".`
      : state.filter === "open"
        ? "No spools have open conflicts."
        : state.filter === "missing"
          ? "No spools are missing from any service."
          : "Everything matches. Nothing to do.";
    const emptyAction = needle
      ? button("Clear search", () => {
          query = "";
          shown = PAGE_SIZE;
          if (groupSearch) {
            groupSearch.value = "";
            groupSearch.focus();
          }
          renderGroups();
        })
      : state.filter !== "all"
        ? button("Show all spools", () => {
            state.filter = "all";
            updatePreferences({ syncFilter: undefined });
            onFilterReset?.();
            renderGroups();
            document.querySelector<HTMLElement>('[data-sync-filter="all"]')?.focus();
          })
        : null;
    const children: HTMLElement[] = cards.length
      ? cards
      : [
          h(
            "div",
            {
              class:
                "flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-muted-foreground",
            },
            h("p", {}, emptyMessage),
            emptyAction,
          ),
        ];
    if (groupSearchClear) groupSearchClear.hidden = !needle;
    if (groupSearchCount) {
      groupSearchCount.textContent = needle
        ? `${candidates} matching ${candidates === 1 ? "spool" : "spools"}`
        : "";
    }
    if (hidden > 0) {
      const renderedCount = cards.length;
      const more = button(`Show ${Math.min(PAGE_SIZE, hidden)} more`, () => {
        pendingFocusIndex = renderedCount;
        shown += PAGE_SIZE;
        renderGroups();
      });
      const all = button(`Show all ${candidates}`, () => {
        pendingFocusIndex = renderedCount;
        shown = Number.POSITIVE_INFINITY;
        renderGroups();
      });
      children.push(
        h(
          "div",
          { class: "flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4" },
          h(
            "p",
            { class: "text-sm text-muted-foreground", "aria-live": "polite" },
            `Showing ${cards.length} of ${candidates} spools`,
          ),
          more,
          all,
        ),
      );
    }
    const container = byId("groups");
    container.replaceChildren(...children);
    if (
      pendingFocusIndex !== null &&
      focusRevealedItem(container, "[data-group]", pendingFocusIndex)
    ) {
      pendingFocusIndex = null;
    }
    if (!pending) {
      pendingFocusIndex = null;
      return;
    }
    // Append the remaining cards a batch per frame; any newer render supersedes this one.
    const status = h("p", { class: "text-sm text-muted-foreground", "aria-live": "polite" });
    const updateStatus = () => {
      status.textContent = `Showing ${container.querySelectorAll("[data-group]").length} of ${candidates} spools…`;
    };
    updateStatus();
    container.append(status);
    const appendBatch = () => {
      if (token !== renderToken) return;
      status.before(...buildCards(SHOW_ALL_BATCH));
      if (
        pendingFocusIndex !== null &&
        focusRevealedItem(container, "[data-group]", pendingFocusIndex)
      ) {
        pendingFocusIndex = null;
      }
      if (next < eligible.length) {
        updateStatus();
        requestAnimationFrame(appendBatch);
      } else {
        pendingFocusIndex = null;
        status.remove();
      }
    };
    requestAnimationFrame(appendBatch);
  }

  const groupSearch = document.getElementById("group-search") as HTMLInputElement | null;
  const groupSearchClear = document.getElementById("group-search-clear");
  const groupSearchCount = document.getElementById("group-search-count");
  wireSlashFocus(groupSearch);
  wireEscapeClear(groupSearch);
  groupSearchClear?.addEventListener("click", () => {
    query = "";
    shown = PAGE_SIZE;
    if (groupSearch) {
      groupSearch.value = "";
      groupSearch.focus();
    }
    renderGroups();
  });
  let groupSearchFrame: number | null = null;
  groupSearch?.addEventListener("input", (event) => {
    query = (event.target as HTMLInputElement).value;
    shown = PAGE_SIZE;
    if (typeof requestAnimationFrame === "function") {
      if (groupSearchFrame !== null) cancelAnimationFrame(groupSearchFrame);
      groupSearchFrame = requestAnimationFrame(() => {
        groupSearchFrame = null;
        renderGroups();
      });
    } else {
      renderGroups();
    }
  });

  return {
    render: renderGroups,
    selectableGroupIds: () => matchingGroups().map((group) => group.id),
  };
}
