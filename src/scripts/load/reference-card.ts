import { FIELD_LABELS } from "@spoolsync/core/core/compare";
import { SOURCE_LABELS, type CommonSpool } from "@spoolsync/core/core/model";
import {
  NO_REFERENCE,
  type ReferenceField,
  type ReferenceItem,
  type ReferenceProposal,
} from "@spoolsync/core/core/reference";

import { t, type MessageKey } from "~/lib/i18n";

import { h } from "../dom";
import { displayValue } from "./cleanup-view";
import { plural } from "./presentation";
import type { PanelContext } from "./reference-context";
import {
  BADGE,
  BUTTON,
  PRESSED,
  VERDICT,
  buyLinks,
  colorChips,
  dryingText,
  referenceImage,
  spoolLabel,
  swatch,
} from "./reference-widgets";

function proposalRow(ctx: PanelContext, proposal: ReferenceProposal, label: string): HTMLElement {
  const status = ctx.controller.status(proposal);
  const accept = h(
    "button",
    {
      type: "button",
      class: `${BUTTON} ${status === "accepted" ? PRESSED : ""}`,
      "aria-pressed": String(status === "accepted"),
      "aria-label": t("reference.action.accept.label", {
        label,
        field: FIELD_LABELS[proposal.field],
      }),
      "data-key": `accept-${proposal.id}`,
    },
    t("reference.action.accept"),
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
          ? t("reference.toast.tookBack", { count })
          : t("reference.toast.acceptedChanges", { count }),
    ),
  );
  const reject = h(
    "button",
    {
      type: "button",
      class: `${BUTTON} ${status === "rejected" ? PRESSED : ""}`,
      "aria-pressed": String(status === "rejected"),
      "aria-label": t("reference.action.reject.label", {
        label,
        field: FIELD_LABELS[proposal.field],
      }),
      "data-key": `reject-${proposal.id}`,
    },
    t("reference.action.reject"),
  );
  reject.addEventListener("click", () =>
    ctx.act(
      () =>
        status === "rejected"
          ? ctx.controller.reset([proposal.id])
          : ctx.controller.reject([proposal.id]),
      (count) =>
        status === "rejected"
          ? t("reference.toast.tookBack", { count })
          : t("reference.toast.rejectedChanges", { count }),
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
                ? t("reference.badge.fills")
                : t("reference.badge.fillsReview")
              : t("reference.badge.overwrites"),
          ),
        ),
        h(
          "div",
          { class: "mt-1 grid gap-1 break-words sm:grid-cols-2" },
          h(
            "p",
            {},
            h("span", { class: "text-xs text-muted-foreground" }, t("reference.value.yours")),
            valueView(proposal.field, proposal.before),
          ),
          h(
            "p",
            {},
            h("span", { class: "text-xs text-muted-foreground" }, t("reference.value.reference")),
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

function candidateList(ctx: PanelContext, item: ReferenceItem): HTMLElement | null {
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
      ctx.act(
        () => (ctx.controller.chooseReference(item.spoolKey, candidate.reference.id) ? 1 : 0),
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
    ctx.act(
      () => (ctx.controller.chooseReference(item.spoolKey, NO_REFERENCE) ? 1 : 0),
      () => "Marked as no match",
    ),
  );
  const reset = h(
    "button",
    { type: "button", class: BUTTON, "data-key": `auto-${item.spoolKey}` },
    "Back to automatic",
  );
  reset.addEventListener("click", () =>
    ctx.act(
      () => (ctx.controller.clearReference(item.spoolKey) ? 1 : 0),
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
      item.match.note ? h("p", { class: "text-xs text-muted-foreground" }, item.match.note) : null,
      h("ul", { class: "grid gap-1" }, ...rows),
      h("div", { class: "flex flex-wrap gap-2" }, noneButton, reset),
    ),
  );
}

function statusBadge(item: ReferenceItem): HTMLElement {
  const selected = item.selected;
  const text = selected
    ? item.chosen
      ? t("reference.status.chosen")
      : t("reference.status.matched", {
          confidence: t(`reference.confidence.${selected.confidence}` as MessageKey),
        })
    : item.chosen
      ? t("reference.status.noMatchChosen")
      : item.match.status === "ambiguous"
        ? t("reference.status.needsChoice")
        : item.match.status === "suggested"
          ? t("reference.status.partial")
          : t("reference.status.noMatch");
  const tone = selected
    ? BADGE.safe
    : item.match.status === "none" || item.chosen
      ? BADGE.neutral
      : BADGE.review;
  return h("span", { class: `rounded-full border px-2 py-0.5 text-xs ${tone}` }, text);
}

/** One spool's card: the matched record, what it would change, and the other candidates. */
export function card(
  ctx: PanelContext,
  item: ReferenceItem,
  spools: Map<string, CommonSpool>,
): HTMLElement {
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
          referenceImage(
            reference,
            [reference.vendor, reference.colorName ?? reference.name].filter(Boolean).join(" ") ||
              reference.id,
          ),
          swatch(reference.colorHex),
          h("span", {}, t("reference.value.reference")),
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
                "Product page",
              )
            : null,
          reference.sourceUrl
            ? h(
                "a",
                {
                  href: reference.sourceUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  class: "text-primary-text underline underline-offset-2 hover:no-underline",
                },
                `View on ${reference.providerLabel}`,
              )
            : null,
        )
      : null,
    reference && dryingText(reference)
      ? h("p", { class: "mt-1 text-xs text-muted-foreground" }, dryingText(reference))
      : null,
    reference ? buyLinks(reference) : null,
    colorBlock(item),
    item.proposals.length
      ? h(
          "ul",
          { class: "mt-3 grid gap-2" },
          ...item.proposals.map((proposal) => proposalRow(ctx, proposal, label)),
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
    candidateList(ctx, item),
  );
}
