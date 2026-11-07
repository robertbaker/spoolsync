import { ruleById, type CleanupProposal } from "@spoolsync/core/core/cleanup";
import { FIELD_LABELS } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";

import { h } from "../dom";
import type { CleanupContext } from "./cleanup-context";
import { displayValue } from "./cleanup-values";
import { BUTTON, PRESSED, indexSpools, spoolLabel } from "./panel-ui";
import { plural } from "./presentation";

/** Rows drawn at once; "Show more" draws the next batch. */
export const PAGE = 60;
const BADGE = {
  safe: "border-success/40 bg-success/10 text-success-text",
  review: "border-warning/40 bg-warning/10",
} as const;

function row(
  ctx: CleanupContext,
  proposal: CleanupProposal,
  spools: Map<string, CommonSpool>,
): HTMLElement {
  const status = ctx.controller.status(proposal);
  const accept = h(
    "button",
    {
      type: "button",
      class: `${BUTTON} ${status === "accepted" ? PRESSED : ""}`,
      "aria-pressed": String(status === "accepted"),
      "data-key": `accept-${proposal.id}`,
    },
    "Accept",
  );
  accept.disabled = !proposal.applicable;
  accept.addEventListener("click", () =>
    ctx.act(
      () =>
        status === "accepted"
          ? ctx.controller.reset([proposal.id])
          : ctx.controller.accept([proposal.id]),
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
      "data-key": `reject-${proposal.id}`,
    },
    "Reject",
  );
  reject.addEventListener("click", () =>
    ctx.act(
      () =>
        status === "rejected"
          ? ctx.controller.reset([proposal.id])
          : ctx.controller.reject([proposal.id]),
      (count) =>
        status === "rejected"
          ? `Took back ${plural(count, "choice")}`
          : `Rejected ${plural(count, "change")}`,
    ),
  );
  const label = `${spoolLabel(spools.get(proposal.spoolKey), proposal.spoolKey)}, ${FIELD_LABELS[proposal.field]}`;
  accept.setAttribute("aria-label", `Accept change: ${label}`);
  reject.setAttribute("aria-label", `Reject change: ${label}`);
  return h(
    "li",
    { class: "rounded-lg border p-3 text-sm", "data-proposal": proposal.id },
    h(
      "div",
      { class: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        { class: "min-w-0 flex-1" },
        h(
          "p",
          { class: "font-medium" },
          `${FIELD_LABELS[proposal.field]} · ${spoolLabel(spools.get(proposal.spoolKey), proposal.spoolKey)}`,
        ),
        h(
          "p",
          { class: "text-xs text-muted-foreground" },
          `${SOURCE_LABELS[proposal.source]} · ID ${proposal.sourceId}`,
        ),
        h(
          "p",
          { class: "mt-1 break-words" },
          h(
            "del",
            { class: "text-muted-foreground" },
            displayValue(proposal.field, proposal.before),
          ),
          " → ",
          h(
            "ins",
            { class: "font-medium no-underline" },
            displayValue(proposal.field, proposal.after),
          ),
        ),
        h("p", { class: "mt-1 text-xs text-muted-foreground" }, proposal.reason),
        proposal.bundle
          ? h(
              "p",
              { class: "mt-1 text-xs text-muted-foreground" },
              "Applied together with the other part of this change.",
            )
          : null,
        proposal.applicable
          ? null
          : h(
              "p",
              { class: "mt-1 text-xs text-warning-text" },
              `${SOURCE_LABELS[proposal.source]} cannot take this change, so it is only shown.`,
            ),
      ),
      h(
        "div",
        { class: "flex shrink-0 flex-col items-end gap-2" },
        h(
          "span",
          { class: `rounded-full border px-2 py-0.5 text-xs ${BADGE[proposal.confidence]}` },
          proposal.confidence === "safe" ? "Safe" : "Review",
        ),
        h("div", { class: "flex gap-2" }, accept, reject),
      ),
    ),
  );
}

export function list(ctx: CleanupContext): HTMLElement {
  const spools = indexSpools(ctx.results);
  const groups = ctx.controller.grouped();
  const total = groups.reduce((sum, group) => sum + group.proposals.length, 0);
  if (!total)
    return h(
      "p",
      { class: "mt-3 text-sm text-muted-foreground" },
      ctx.controller.counts().total
        ? "No suggestions match these filters."
        : "Nothing to clean up with the rules that are on.",
    );
  let remaining = ctx.state.limit;
  const sections: HTMLElement[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const shown = group.proposals.slice(0, remaining);
    remaining -= shown.length;
    sections.push(
      h(
        "section",
        { class: "mt-4" },
        h(
          "h4",
          { class: "text-sm font-semibold" },
          `${ruleById(group.rule).label} (${group.proposals.length})`,
        ),
        h(
          "ul",
          { class: "mt-2 grid gap-2" },
          ...shown.map((proposal) => row(ctx, proposal, spools)),
        ),
      ),
    );
  }
  if (total > ctx.state.limit) {
    const more = h(
      "button",
      { type: "button", class: `${BUTTON} mt-3`, "data-key": "show-more" },
      `Show ${Math.min(PAGE, total - ctx.state.limit)} more (${total - ctx.state.limit} not shown)`,
    );
    more.addEventListener("click", () => {
      ctx.state.limit += PAGE;
      ctx.draw();
    });
    sections.push(h("div", {}, more));
  }
  return h("div", {}, ...sections);
}
