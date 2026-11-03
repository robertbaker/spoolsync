import { pairKey, type MatchSuggestion } from "@spoolsync/core/core/match";

/** Stable identity of a suggestion across redraws and answers. */
export function suggestionId(suggestion: MatchSuggestion): string {
  return pairKey(...suggestion.pair);
}

export interface ReviewPosition {
  /** The pair to show now, or `null` when nothing is left to show. */
  current: string | null;
  /** 1-based place of `current` in the order the review started with; 0 when there is none. */
  position: number;
  /** Every pair the review has seen, answered or not. */
  total: number;
  /** Pairs still waiting for an answer, skipped ones included. */
  pending: number;
  /** Pending pairs the visitor chose to look at later. */
  skipped: number;
}

/**
 * The order of a one-at-a-time review. It never answers anything: a pair leaves the queue only when
 * it stops being a pending suggestion, and a skipped pair stays pending and is offered again once
 * the rest are done. Pure so the ordering rules can be tested without a page.
 */
export class ReviewQueue {
  private order: string[] = [];
  private skippedIds = new Set<string>();
  private lastPending = new Set<string>();
  /** Index in `order` the next unskipped pair is searched from. */
  private from = 0;

  /**
   * Takes the current pending pairs. New pairs (for example ones that appear after a merge) join
   * the end; a pair that returns after an undo becomes the current one.
   */
  sync(pending: readonly string[]): void {
    const first = this.order.length === 0;
    for (const id of pending) {
      if (!this.order.includes(id)) this.order.push(id);
      else if (!first && !this.lastPending.has(id)) this.focusOn(id);
    }
    this.lastPending = new Set(pending);
  }

  /** Leaves the current pair pending and moves on. */
  skip(id: string): void {
    if (!this.lastPending.has(id)) return;
    this.skippedIds.add(id);
    this.from = this.order.indexOf(id) + 1;
  }

  /** Makes `id` the current pair again, for example after undoing its answer. */
  focusOn(id: string): void {
    this.skippedIds.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.from = index;
  }

  /** Offers every skipped pair again from the start. */
  reviewSkipped(): void {
    this.skippedIds.clear();
    this.from = 0;
  }

  view(): ReviewPosition {
    const open = this.order.filter((id) => this.lastPending.has(id) && !this.skippedIds.has(id));
    const current = open.find((id) => this.order.indexOf(id) >= this.from) ?? open[0] ?? null;
    return {
      current,
      position: current ? this.order.indexOf(current) + 1 : 0,
      total: this.order.length,
      pending: this.lastPending.size,
      skipped: this.order.filter((id) => this.lastPending.has(id) && this.skippedIds.has(id))
        .length,
    };
  }
}

/** Screen reader text for the pair now showing. */
export function pairAnnouncement(view: ReviewPosition, description: string): string {
  return `Match ${view.position} of ${view.total}: ${description}. ${view.pending} pending.`;
}

/** Screen reader text after a key press, so the result is heard without looking at the page. */
export function resultAnnouncement(
  action: "same" | "different" | "skip" | "undo" | "none",
  view: ReviewPosition,
): string {
  const prefix =
    action === "same"
      ? "Marked as the same spool."
      : action === "different"
        ? "Marked as different spools."
        : action === "skip"
          ? "Skipped for now. It stays pending."
          : action === "undo"
            ? "Undid the last change."
            : "";
  if (view.current) return prefix;
  if (view.pending > 0)
    return `${prefix} Every remaining match was skipped. ${view.skipped} still pending.`.trim();
  return `${prefix} All matches reviewed.`.trim();
}
