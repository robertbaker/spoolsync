import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@spoolsync/core/core/model";

import { t } from "~/lib/i18n";
import { SOURCE_GUIDES } from "~/lib/source-guides";

import { h, showToast } from "../dom";
import { SETUP_EVENT } from "./launch";
import {
  buildSteps,
  clampStep,
  dismissSetup,
  isSetupDismissed,
  normalizeSelection,
  shouldAutoOpen,
  type SetupStep,
} from "./steps";

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary";
const PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export interface SetupOptions {
  /** How many services hold an inventory right now. */
  loadedCount(): number;
}

/**
 * Builds the guide dialog once and returns a function that opens it. The last step hands off to the
 * page's multi-file picker (`#smart-file`), so detection, size limits, and request revisions are
 * the ones every other load uses.
 */
function createWizard(): () => void {
  let dialog: HTMLDialogElement | undefined;
  let opener: Element | null = null;
  const selected = new Set<SourceId>();
  let index = 0;

  const body = h("div", { class: "p-6" });

  function close(): void {
    dialog?.close();
  }

  function heading(text: string): HTMLElement {
    const title = h(
      "h2",
      { id: "setup-title", class: "text-xl font-bold tracking-tight", tabindex: "-1" },
      text,
    );
    return title;
  }

  function chooseStep(): Node[] {
    const boxes = SOURCE_IDS.map((source) => {
      const input = h("input", {
        type: "checkbox",
        value: source,
        id: `setup-app-${source}`,
        class: "size-4",
      });
      input.checked = selected.has(source);
      input.addEventListener("change", () => {
        if (input.checked) selected.add(source);
        else selected.delete(source);
        update();
      });
      return h(
        "label",
        {
          for: `setup-app-${source}`,
          class:
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50",
        },
        input,
        h(
          "span",
          {},
          h("span", { class: "font-medium" }, SOURCE_LABELS[source]),
          h("span", { class: "block text-xs text-muted-foreground" }, SOURCE_GUIDES[source].kind),
        ),
      );
    });
    return [
      heading(t("wizard.choose.title")),
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        t("wizard.choose.hint"),
      ),
      h(
        "fieldset",
        { class: "mt-4" },
        h("legend", { class: "sr-only" }, t("wizard.choose.legend")),
        h("div", { class: "grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" }, ...boxes),
      ),
    ];
  }

  function guideStep(source: SourceId): Node[] {
    const guide = SOURCE_GUIDES[source];
    return [
      heading(t("wizard.guide.title", { app: SOURCE_LABELS[source] })),
      h("p", { class: "mt-1 text-xs text-muted-foreground" }, t("wizard.guide.fileType", { kind: guide.kind })),
      h("p", { class: "mt-3 text-sm leading-6" }, guide.how),
    ];
  }

  function loadStep(): Node[] {
    const chosen = normalizeSelection(selected);
    const choose = h("button", { type: "button", class: PRIMARY, id: "setup-choose-files" }, t("wizard.load.choose"));
    choose.addEventListener("click", () => {
      const picker = document.getElementById("smart-file") as HTMLInputElement | null;
      if (!picker) {
        showToast(t("wizard.noPicker"), "error");
        return;
      }
      dismissSetup();
      close();
      // Opened in the same click so the browser still treats it as a user action.
      picker.click();
    });
    return [
      heading(t("wizard.load.title")),
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        chosen.length
          ? t("wizard.load.hintSome", {
              count: chosen.length,
              apps: chosen.map((id) => SOURCE_LABELS[id]).join(", "),
            })
          : t("wizard.load.hintNone"),
      ),
      h("div", { class: "mt-4" }, choose),
      h(
        "p",
        { class: "mt-3 text-xs text-muted-foreground" },
        t("wizard.load.privacy"),
      ),
    ];
  }

  function render(): void {
    const steps = buildSteps(selected);
    index = clampStep(index, steps);
    const step: SetupStep = steps[index]!;
    const content =
      step.kind === "choose" ? chooseStep() : step.kind === "guide" ? guideStep(step.source) : loadStep();

    const back = h("button", { type: "button", class: BUTTON }, t("wizard.back"));
    back.disabled = index === 0;
    back.addEventListener("click", () => {
      index -= 1;
      render();
      focusHeading();
    });
    const last = index === steps.length - 1;
    const next = h(
      "button",
      { type: "button", class: last ? BUTTON : PRIMARY },
      last ? t("wizard.done") : t("wizard.next"),
    );
    if (step.kind === "choose" && selected.size === 0) next.textContent = t("wizard.skipToLoad");
    next.addEventListener("click", () => {
      if (last) {
        dismissSetup();
        close();
        return;
      }
      index = step.kind === "choose" && selected.size === 0 ? steps.length - 1 : index + 1;
      render();
      focusHeading();
    });
    const skip = h(
      "button",
      { type: "button", class: `${BUTTON} text-muted-foreground` },
      t("wizard.dontShow"),
    );
    skip.addEventListener("click", () => {
      dismissSetup();
      close();
    });

    body.replaceChildren(
      h(
        "p",
        { class: "mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", role: "status" },
        t("wizard.progress", { current: index + 1, total: steps.length }),
      ),
      ...content,
      h(
        "div",
        { class: "mt-6 flex flex-wrap items-center justify-between gap-3" },
        skip,
        h("div", { class: "flex gap-2" }, back, next),
      ),
    );
  }

  function update(): void {
    // Ticking a box changes how many steps there are; only the footer needs to follow it.
    const active = document.activeElement?.id;
    render();
    if (active) document.getElementById(active)?.focus();
  }

  function focusHeading(): void {
    document.getElementById("setup-title")?.focus();
  }

  function ensure(): HTMLDialogElement {
    if (dialog) return dialog;
    dialog = h(
      "dialog",
      {
        id: "setup-dialog",
        closedby: "any",
        class:
          "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/25 backdrop:backdrop-blur-xs",
        "aria-labelledby": "setup-title",
      },
      body,
    );
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog?.close();
    });
    // Closing any way (Esc, backdrop, buttons) counts as having seen it, and focus goes back.
    dialog.addEventListener("close", () => {
      dismissSetup();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      opener = null;
    });
    document.body.append(dialog);
    return dialog;
  }

  return () => {
    const element = ensure();
    if (element.open) return;
    opener = document.activeElement;
    index = 0;
    render();
    element.showModal();
    focusHeading();
  };
}

/**
 * Offers the guide to someone with nothing loaded who has not dismissed it, and lets the footer,
 * palette, and `?setup=1` links reopen it at any time.
 */
export function wireSetupGuide({ loadedCount }: SetupOptions): void {
  const open = createWizard();
  document.addEventListener(SETUP_EVENT, open);
  const params = new URLSearchParams(location.search);
  if (params.get("setup") === "1") {
    params.delete("setup");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    open();
    return;
  }
  if (
    shouldAutoOpen({
      loadedCount: loadedCount(),
      dismissed: isSetupDismissed(),
      search: location.search,
      automated: navigator.webdriver === true,
    })
  )
    open();
}
