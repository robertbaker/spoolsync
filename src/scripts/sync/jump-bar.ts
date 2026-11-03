export interface JumpBarState {
  /** Changes ready to apply. */
  changes: number;
  /** Services that have changes. */
  services: number;
  /** Possible matches still waiting for an answer. */
  pending: number;
}

/** The sentence the bar shows for a state; changes-only reads exactly as it always has. */
export function jumpBarSummary({ changes, services, pending }: JumpBarState): string {
  const parts: string[] = [];
  if (pending > 0) parts.push(`Pending matches (${pending})`);
  if (changes > 0)
    parts.push(
      `${changes} ${changes === 1 ? "change" : "changes"} ready across ${services} ${services === 1 ? "service" : "services"}`,
    );
  return parts.join(" · ");
}

/**
 * A sticky bar that keeps two things from being missed: possible matches still waiting for an
 * answer, and changes ready to apply. Each jump link hides while its target is on screen, and the
 * whole bar hides once neither needs attention.
 */
export function createJumpBar(): { update(state: JumpBarState): void } {
  const bar = document.getElementById("sync-bar");
  const summary = document.getElementById("sync-bar-summary");
  const applyLink = document.getElementById("sync-bar-apply");
  const reviewLink = document.getElementById("sync-bar-review");
  const targets = {
    apply: document.getElementById("tour-apply"),
    review: document.getElementById("suggestions-section"),
  };
  const visible = { apply: false, review: false };
  let state: JumpBarState = { changes: 0, services: 0, pending: 0 };

  function render(): void {
    const showReview = state.pending > 0 && !visible.review;
    const showApply = state.changes > 0 && !visible.apply;
    if (reviewLink) reviewLink.hidden = !showReview;
    if (applyLink) applyLink.hidden = !showApply;
    if (summary) summary.textContent = jumpBarSummary(state);
    if (bar) bar.hidden = !showReview && !showApply;
  }

  if ("IntersectionObserver" in window)
    for (const key of ["apply", "review"] as const) {
      const target = targets[key];
      if (!target) continue;
      new IntersectionObserver((entries) => {
        visible[key] = entries.some((entry) => entry.isIntersecting);
        render();
      }).observe(target);
    }

  return {
    update(next) {
      state = next;
      render();
    },
  };
}
