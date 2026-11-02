import { SOURCE_LABELS, type SourceId } from "@spoolsync/core/core/model";
import { detectInventorySources, type DetectedInventory } from "@spoolsync/core/workflow";

import { h } from "../dom";
import { readInventoryFile } from "./file-source";
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
    const failed = !loaded || loaded.spools.length === 0;
    row.replaceWith(
      failed
        ? line(
            "error",
            `${file.name} could not be read as ${SOURCE_LABELS[source]}. See its panel below.`,
          )
        : line(
            "success",
            `${file.name} → ${SOURCE_LABELS[source]} (${plural(loaded.spools.length, "spool")})`,
          ),
    );
  }

  async function handle(files: File[]): Promise<void> {
    if (!files.length) return;
    const list = h("ul", { class: "space-y-1.5" });
    results!.replaceChildren(list);
    const assigned = new Map<SourceId, string>();
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
