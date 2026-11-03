import { comparePair, formatValue, type PairStatus } from "@spoolsync/core/core/compare";
import type { MatchSuggestion, SpoolGroup } from "@spoolsync/core/core/match";
import { SOURCE_IDS, SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";

import { h } from "../dom";
import { button, sourceTag, spoolTitle, swatches } from "./presentation";

const STATUS_TEXT: Record<PairStatus, string> = {
  same: "Same",
  differs: "Differs",
  unsupported: "Not comparable",
};

/** The two records a suggestion proposes, and anything else already linked to them by IDs. */
export function suggestionRecords(
  suggestion: MatchSuggestion,
  groupsById: ReadonlyMap<string, SpoolGroup>,
): { members: CommonSpool[]; others: CommonSpool[] } {
  const all = suggestion.groupIds.flatMap((id) => {
    const group = groupsById.get(id)!;
    return SOURCE_IDS.flatMap((source) => (group.members[source] ? [group.members[source]!] : []));
  });
  const members = all.filter((spool) =>
    suggestion.pair.includes(`${spool.source}:${spool.sourceId}`),
  );
  return { members, others: all.filter((spool) => !members.includes(spool)) };
}

/** A short plain-text description of a pair, for screen reader announcements. */
export function describePair(members: readonly CommonSpool[]): string {
  return members
    .map((spool) => `${SOURCE_LABELS[spool.source]} ${spoolTitle(spool)}`)
    .join(" and ");
}

/**
 * A real table, one row per field. A differing row says "Differs" in text and carries a bar, so the
 * highlight never relies on color alone.
 */
export function pairTable(a: CommonSpool, b: CommonSpool): HTMLElement {
  const rows = comparePair(a, b);
  const differing = rows.filter((row) => row.status === "differs").length;
  const cell = (spool: CommonSpool, field: string, text: string) =>
    h(
      "td",
      { class: "px-3 py-1.5 align-top" },
      field === "colors" && spool.colors.length ? swatches(spool.colors) : null,
      field === "colors" && spool.colors.length ? " " : null,
      text,
    );
  return h(
    "div",
    { class: "mt-3 overflow-x-auto rounded-md border" },
    h(
      "table",
      { class: "pair-table w-full text-sm" },
      h(
        "caption",
        { class: "sr-only" },
        `Comparison of ${SOURCE_LABELS[a.source]} ${a.sourceId} and ${SOURCE_LABELS[b.source]} ${b.sourceId}: ${differing} of ${rows.length} fields differ`,
      ),
      h(
        "thead",
        { class: "text-muted-foreground" },
        h(
          "tr",
          {},
          h("th", { class: "px-3 py-1.5 text-left font-medium", scope: "col" }, "Field"),
          h(
            "th",
            { class: "px-3 py-1.5 text-left font-medium", scope: "col" },
            `${SOURCE_LABELS[a.source]} ${a.sourceId}`,
          ),
          h(
            "th",
            { class: "px-3 py-1.5 text-left font-medium", scope: "col" },
            `${SOURCE_LABELS[b.source]} ${b.sourceId}`,
          ),
          h("th", { class: "px-3 py-1.5 text-left font-medium", scope: "col" }, "Result"),
        ),
      ),
      h(
        "tbody",
        {},
        ...rows.map((row) =>
          h(
            "tr",
            {
              class: "border-t",
              "data-field": row.field,
              "data-differs": String(row.status === "differs"),
            },
            h("th", { class: "px-3 py-1.5 text-left font-medium", scope: "row" }, row.label),
            cell(a, row.field, row.left),
            cell(b, row.field, row.right),
            h(
              "td",
              { class: "px-3 py-1.5 align-top whitespace-nowrap" },
              row.status === "differs" ? "≠ " : row.status === "same" ? "= " : "– ",
              STATUS_TEXT[row.status],
            ),
          ),
        ),
      ),
    ),
  );
}

export interface CardActions {
  same(): void;
  different(): void;
  /** Present in the one-at-a-time review: skip the pair and keep it pending. */
  skip?: () => void;
  undo?: () => void;
  canUndo?: boolean;
}

function keyHint(key: string): HTMLElement {
  return h(
    "kbd",
    { class: "ml-2 rounded border bg-background/60 px-1 font-mono text-xs", "aria-hidden": "true" },
    key,
  );
}

function shortcutButton(
  label: string,
  key: string,
  onClick: () => void,
  variant: "primary" | "outline",
): HTMLButtonElement {
  const element = button(label, onClick, variant, { "aria-keyshortcuts": key });
  element.append(keyHint(key));
  return element;
}

/** One possible match: the two records, how they compare, why they were suggested, and answers. */
export function suggestionCard(
  suggestion: MatchSuggestion,
  groupsById: ReadonlyMap<string, SpoolGroup>,
  actions: CardActions,
  heading?: HTMLElement,
): HTMLElement {
  const { members, others } = suggestionRecords(suggestion, groupsById);
  const review = actions.skip !== undefined;
  return h(
    "article",
    { class: "modern-card rounded-2xl border bg-card p-5 shadow-xs", "data-suggestion": "true" },
    heading ?? null,
    h(
      "div",
      { class: "grid gap-3 sm:grid-cols-2" },
      ...members.map((spool) =>
        h(
          "div",
          { class: "rounded-md bg-muted/50 p-3 text-sm" },
          h("div", { class: "flex items-center gap-2" }, sourceTag(spool.source, spool.sourceId)),
          h("p", { class: "mt-2 font-medium" }, spoolTitle(spool), " ", swatches(spool.colors)),
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
    members.length === 2 ? pairTable(members[0]!, members[1]!) : null,
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
      { class: "mt-3 flex flex-wrap gap-2" },
      review
        ? shortcutButton("Same spool", "S", actions.same, "primary")
        : button("Same spool", actions.same, "primary"),
      review
        ? shortcutButton("Different spools", "D", actions.different, "outline")
        : button("Different spools", actions.different),
      review ? shortcutButton("Skip for now", "N", actions.skip!, "outline") : null,
      review && actions.undo
        ? (() => {
            const undo = shortcutButton("Undo", "Z", actions.undo, "outline");
            undo.disabled = !actions.canUndo;
            return undo;
          })()
        : null,
    ),
  );
}
