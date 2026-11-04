import {
  SOURCE_LABELS,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { detectInventorySources, type DetectedInventory } from "@spoolsync/core/workflow";

import { t } from "~/lib/i18n";

import { h } from "../dom";
import { readInventoryFile } from "./file-source";
import { isMappableFile, openColumnMapper } from "./import-mapper";
import { importReportView } from "./import-report-view";
import { plural } from "./presentation";
import type { LoadContext } from "./state";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 12;

type Outcome = "success" | "error" | "warning";

function line(outcome: Outcome, ...children: Array<string | Node>): HTMLElement {
  const tone = {
    success: ["material-symbols:check-circle-rounded", "text-success-text"],
    error: ["material-symbols:error-outline-rounded", "text-destructive"],
    warning: ["material-symbols:info-outline-rounded", "text-warning-text"],
  }[outcome];
  return h(
    "li",
    { class: `flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${tone[1]}` },
    h(
      "span",
      { class: "font-semibold", "aria-hidden": "true" },
      outcome === "success" ? "✓" : outcome === "error" ? "✕" : "!",
    ),
    h("span", { class: "text-foreground" }, ...children),
  );
}

const PREVIEW_ROWS = 5;

/** A short, collapsed look at what a file contained, so a wrong match is easy to spot. */
function preview(result: LoadResult): HTMLElement {
  const label = (spool: CommonSpool) =>
    [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
  const swatch = (spool: CommonSpool) => {
    const dot = h("span", {
      class: "inline-block size-3.5 shrink-0 rounded-full border",
      "aria-hidden": "true",
    });
    if (spool.colors[0]) dot.style.backgroundColor = `#${spool.colors[0]}`;
    return dot;
  };
  const rows = result.spools
    .slice(0, PREVIEW_ROWS)
    .map((spool) =>
      h(
        "li",
        { class: "flex items-center gap-2 py-0.5" },
        swatch(spool),
        h("span", { class: "min-w-0 truncate" }, label(spool)),
        h(
          "span",
          { class: "ml-auto shrink-0 text-muted-foreground" },
          spool.remainingWeight === null ? "" : `${Math.round(spool.remainingWeight)} g left`,
        ),
      ),
    );
  const more = result.spools.length - rows.length;
  return h(
    "details",
    { class: "mt-1 w-full rounded-lg border bg-muted/20 text-xs" },
    h(
      "summary",
      {
        class:
          "cursor-pointer p-2 font-medium focus-visible:outline-2 focus-visible:outline-primary",
      },
      `Preview${result.warnings.length ? ` · ${plural(result.warnings.length, "note")}` : ""}`,
    ),
    h(
      "div",
      { class: "px-3 pb-2" },
      h("ul", {}, ...rows),
      more > 0 ? h("p", { class: "pt-1 text-muted-foreground" }, `and ${more} more`) : null,
      ...result.warnings.slice(0, 3).map((warning) => h("p", { class: "pt-1" }, warning)),
    ),
  );
}

/**
 * One drop target for every service: each file is matched to the service whose parser reads it. A
 * file that several services could read asks which one it is, and nothing is guessed.
 */
export function wireSmartDrop(context: LoadContext): void {
  const input = document.getElementById("smart-file") as HTMLInputElement | null;
  const zone = document.getElementById("smart-drop");
  const results = document.getElementById("smart-message");
  if (!input || !zone || !results) return;

  async function loadAs(source: SourceId, file: File, row: HTMLElement): Promise<void> {
    await readInventoryFile(source, file, context);
    const loaded = context.state.results.get(source);
    if (!loaded || loaded.spools.length === 0) {
      row.replaceWith(
        line(
          "error",
          `${file.name} could not be read as ${SOURCE_LABELS[source]}. See its panel below.`,
        ),
      );
      return;
    }
    const outcome = line(
      "success",
      `${file.name} → ${SOURCE_LABELS[source]} (${plural(loaded.spools.length, "spool")})`,
    );
    outcome.append(preview(loaded), importReportView(loaded, file.name));
    row.replaceWith(outcome);
  }

  async function handle(files: File[]): Promise<void> {
    if (!files.length) return;
    const list = h("ul", { class: "space-y-1.5" });
    results!.replaceChildren(list);
    const assigned = new Map<SourceId, string>();
    // Keep the outcome in view above the sticky bar.
    results!.scrollIntoView({ block: "nearest" });
    for (const file of files.slice(0, MAX_FILES)) {
      const row = line("warning", `${file.name}: checking…`);
      list.append(row);
      if (file.size > MAX_FILE_BYTES) {
        row.replaceWith(line("error", `${file.name} is larger than 20 MB; check the file.`));
        continue;
      }
      let matches: DetectedInventory[];
      try {
        matches = await detectInventorySources(file.name, new Uint8Array(await file.arrayBuffer()));
      } catch {
        matches = [];
      }
      if (matches.length === 0) {
        if (isMappableFile(file.name)) {
          // Not from a supported tool, but readable as a table: offer to map its columns to a
          // Spoolman-format CSV. This never loads the file as an inventory.
          const map = h(
            "button",
            {
              type: "button",
              class:
                "rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-2",
            },
            t("map.open"),
          );
          map.addEventListener("click", () => void openColumnMapper(file, map));
          row.replaceWith(line("error", `${t("map.unrecognised", { file: file.name })} `, map));
          continue;
        }
        row.replaceWith(
          line(
            "error",
            `${file.name} was not recognised. Open a service below and choose it there to see why.`,
          ),
        );
        continue;
      }
      if (matches.length > 1) {
        const question = h("li", { class: "text-sm" });
        const choices = matches.map((match) => {
          const button = h(
            "button",
            {
              type: "button",
              class:
                "rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-2",
            },
            `${SOURCE_LABELS[match.source]} (${plural(match.spoolCount, "spool")})`,
          );
          button.addEventListener("click", () => {
            question
              .querySelectorAll("button")
              .forEach((other) => ((other as HTMLButtonElement).disabled = true));
            void loadAs(match.source, file, question);
          });
          return button;
        });
        question.append(
          h(
            "span",
            { class: "text-foreground" },
            `${file.name} could be from more than one service. Which is it? `,
          ),
          h("span", { class: "inline-flex flex-wrap gap-2 align-middle" }, ...choices),
        );
        row.replaceWith(question);
        continue;
      }
      const source = matches[0]!.source;
      const previous = assigned.get(source);
      if (previous) {
        row.replaceWith(
          line(
            "warning",
            `${file.name} is also ${SOURCE_LABELS[source]}, which ${previous} already filled. Load one at a time to replace it.`,
          ),
        );
        continue;
      }
      assigned.set(source, file.name);
      await loadAs(source, file, row);
    }
    if (files.length > MAX_FILES)
      list.append(line("warning", `Only the first ${MAX_FILES} files were read.`));
  }

  input.addEventListener("change", () => {
    void handle([...(input.files ?? [])]);
    input.value = "";
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.dataset["dragging"] = "true";
  });
  zone.addEventListener("dragleave", () => delete zone.dataset["dragging"]);
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete zone.dataset["dragging"];
    void handle([...(event.dataTransfer?.files ?? [])]);
  });
}
