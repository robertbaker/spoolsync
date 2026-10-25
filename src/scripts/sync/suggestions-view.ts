import { formatValue } from "@spoolsync/core/core/compare";
import type { MatchSuggestion } from "@spoolsync/core/core/match";
import { SOURCE_IDS, SOURCE_LABELS } from "@spoolsync/core/core/model";

import { byId, h } from "../dom";
import { button, sourceTag, spoolTitle, swatches } from "./presentation";
import type { SyncSession } from "./session";

export function createSuggestionsView(
  state: SyncSession,
  decide: (suggestion: MatchSuggestion, same: boolean) => void,
) {
  function renderSuggestions(): void {
    byId("suggestions-section").hidden = state.match.suggestions.length === 0;
    const groupsById = new Map(state.match.groups.map((group) => [group.id, group]));
    byId("suggestions").replaceChildren(
      ...state.match.suggestions.map((suggestion) => {
        // Show the two records being proposed; anything else in their groups is already linked by ids.
        const all = suggestion.groupIds.flatMap((id) => {
          const group = groupsById.get(id)!;
          return SOURCE_IDS.flatMap((source) =>
            group.members[source] ? [group.members[source]!] : [],
          );
        });
        const members = all.filter((spool) =>
          suggestion.pair.includes(`${spool.source}:${spool.sourceId}`),
        );
        const others = all.filter((spool) => !members.includes(spool));
        return h(
          "article",
          { class: "modern-card rounded-2xl border bg-card p-5 shadow-xs" },
          h(
            "div",
            { class: "grid gap-3 sm:grid-cols-2" },
            ...members.map((spool) =>
              h(
                "div",
                { class: "rounded-md bg-muted/50 p-3 text-sm" },
                h(
                  "div",
                  { class: "flex items-center gap-2" },
                  sourceTag(spool.source, spool.sourceId),
                ),
                h(
                  "p",
                  { class: "mt-2 font-medium" },
                  spoolTitle(spool),
                  " ",
                  swatches(spool.colors),
                ),
                h(
                  "p",
                  { class: "mt-1 text-muted-foreground" },
                  `${formatValue("remainingWeight", spool.remainingWeight)} of ${formatValue("initialWeight", spool.initialWeight)} g`,
                  spool.location ? ` · ${spool.location}` : "",
                  spool.purchasedOn ? ` · bought ${spool.purchasedOn}` : "",
                ),
              ),
            ),
          ),
          h(
            "p",
            { class: "mt-3 text-xs text-muted-foreground" },
            `Why: ${suggestion.reasons.join(", ")}`,
          ),
          others.length
            ? h(
                "p",
                { class: "mt-1 text-xs text-muted-foreground" },
                `Also linked by IDs: ${others.map((spool) => `${SOURCE_LABELS[spool.source]} ${spool.sourceId}`).join(", ")}`,
              )
            : null,
          h(
            "div",
            { class: "mt-3 flex gap-2" },
            button("Same spool", () => decide(suggestion, true), "primary"),
            button("Different spools", () => decide(suggestion, false)),
          ),
        );
      }),
    );
  }

  return renderSuggestions;
}
