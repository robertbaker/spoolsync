import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";
import { createEmptyInventory, loadInventoryFile } from "@spoolsync/core/workflow";

import { byId, h, notice } from "../dom";
import { plural, warningsNotice } from "./presentation";
import type { LoadContext } from "./state";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Wires a file picker and drop zone to a parser. Parsers load on first use, so the page does not
 * download every format's code (and TigerTag's reference tables) up front. They throw for a file
 * that is not theirs.
 */
export function wireFileSource(source: SourceId, { state, store }: LoadContext): void {
  const fileInput = byId<HTMLInputElement>(`${source}-file`);
  const dropZone = byId(`${source}-drop`);
  const message = byId(`${source}-message`);
  document.getElementById(`${source}-empty`)?.addEventListener("click", async () => {
    const current = state.nextRevision(source);
    try {
      const result = await createEmptyInventory(source);
      if (!state.isCurrent(source, current)) return;
      message.replaceChildren(
        notice(
          "success",
          `Empty ${SOURCE_LABELS[source]} inventory ready`,
          h("p", {}, "Select the missing spools to add on the Sync page."),
        ),
      );
      store(result);
    } catch (error) {
      if (!state.isCurrent(source, current)) return;
      message.replaceChildren(notice("error", (error as Error).message));
    }
  });

  async function read(file: File): Promise<void> {
    const current = state.nextRevision(source);
    message.replaceChildren();
    if (file.size > MAX_FILE_BYTES) {
      message.replaceChildren(
        notice(
          "error",
          "File too large",
          h("p", {}, "Exports are far smaller than 20 MB; check the file."),
        ),
      );
      return;
    }
    let result: LoadResult;
    try {
      result = await loadInventoryFile(source, await file.text());
    } catch (error) {
      result = {
        source,
        spools: [],
        warnings: [(error as Error).message],
        loadedAt: new Date().toISOString(),
      };
    }
    if (!state.isCurrent(source, current)) return;
    if (!result.spools.length && result.warnings.length) {
      message.replaceChildren(
        notice(
          "error",
          `No spools found in ${file.name}`,
          ...result.warnings.map((w) => h("p", { class: "mt-1" }, w)),
          state.results.has(source)
            ? h("p", { class: "mt-2" }, "Your previously loaded inventory is still available.")
            : null,
        ),
      );
      return;
    }
    message.replaceChildren(
      notice("success", `Loaded ${plural(result.spools.length, "spool")} from ${file.name}`),
      ...[warningsNotice(result)].filter((node): node is HTMLElement => node !== null),
    );
    store(result);
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void read(file);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.dataset["dragging"] = "true";
  });
  dropZone.addEventListener("dragleave", () => delete dropZone.dataset["dragging"]);
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete dropZone.dataset["dragging"];
    if (event.dataTransfer && event.dataTransfer.files.length > 1) {
      message.replaceChildren(notice("error", "Choose one inventory file at a time."));
      return;
    }
    const file = event.dataTransfer?.files[0];
    if (file) void read(file);
  });
}
