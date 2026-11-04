import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { WORKFLOW_STEPS, type WorkflowStepId } from "~/config/site";
import { readLoadResult } from "~/lib/browser/storage/inventories";
import { LOCALE_CHANGED, t, type MessageKey } from "~/lib/i18n";

import { INVENTORIES_CHANGED_EVENT } from "./load/state";

export type StepState = "done" | "current" | "todo";

export interface StepView {
  id: WorkflowStepId;
  state: StepState;
  /** Short status under the step name. */
  meta: string;
}

/** Number of services with a loaded inventory in this tab. */
export function countLoaded(read: typeof readLoadResult = readLoadResult): number {
  let loaded = 0;
  for (const source of SOURCE_IDS) {
    try {
      if (read(source)) loaded += 1;
    } catch {
      // Storage can be unavailable (private windows); treat that source as not loaded.
    }
  }
  return loaded;
}

/**
 * Where the person is in Load, Review, Apply. A step is done once what it needs exists: Load needs
 * one inventory, Review needs two (there is nothing to compare with fewer). Apply is never marked
 * done because only the person knows when they have applied or downloaded.
 */
export function workflowProgress(current: WorkflowStepId, loaded: number): StepView[] {
  const comparable = loaded >= 2;
  return WORKFLOW_STEPS.map((step): StepView => {
    const isCurrent = step.id === current;
    if (step.id === "load") {
      return {
        id: step.id,
        state: isCurrent ? "current" : loaded > 0 ? "done" : "todo",
        meta: loaded === 0 ? t("stepper.load.empty") : t("stepper.load.count", { count: loaded }),
      };
    }
    if (step.id === "review") {
      return {
        id: step.id,
        state: isCurrent ? "current" : comparable && current === "apply" ? "done" : "todo",
        meta: comparable
          ? t("stepper.review.ready")
          : loaded === 1
            ? t("stepper.review.one")
            : t("stepper.review.none"),
      };
    }
    return {
      id: step.id,
      state: isCurrent ? "current" : "todo",
      meta: comparable ? t("stepper.apply.ready") : t("stepper.apply.wait"),
    };
  });
}

function currentFromHash(page: WorkflowStepId, hash: string): WorkflowStepId {
  if (page !== "load" && hash === "#tour-apply") return "apply";
  return page === "apply" ? "review" : page;
}

/** Keeps the stepper in step with storage and the page hash. Returns a function that removes listeners. */
export function wireWorkflowSteps(root: ParentNode = document): () => void {
  const nav = root.querySelector<HTMLElement>("[data-workflow-steps]");
  if (!nav) return () => {};
  const page = (nav.dataset["page"] as WorkflowStepId | undefined) ?? "load";
  const live = nav.querySelector<HTMLElement>("[data-workflow-live]");

  const render = () => {
    const current = currentFromHash(page, location.hash);
    const views = workflowProgress(current, countLoaded());
    for (const view of views) {
      const item = nav.querySelector<HTMLElement>(`[data-step="${view.id}"]`);
      if (!item) continue;
      item.dataset["state"] = view.state;
      const link = item.querySelector<HTMLAnchorElement>("a");
      if (link) {
        if (view.state === "current") link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      }
      const meta = item.querySelector<HTMLElement>("[data-step-meta]");
      if (meta) meta.textContent = view.meta;
      const label = item.querySelector<HTMLElement>(".workflow-steps__label");
      if (label) label.textContent = t(`stepper.${view.id}` as MessageKey);
    }
    if (live) {
      const loaded = views.find((view) => view.id === "load");
      live.textContent = loaded ? loaded.meta : "";
    }
  };

  const controller = new AbortController();
  const options = { signal: controller.signal };
  document.addEventListener(INVENTORIES_CHANGED_EVENT, render, options);
  window.addEventListener("hashchange", render, options);
  window.addEventListener("pageshow", render, options);
  document.addEventListener(LOCALE_CHANGED, render, options);
  render();
  return () => controller.abort();
}
