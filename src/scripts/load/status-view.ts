import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { byId, h, notice, showToast } from "../dom";
import { badge } from "./presentation";
import type { LoadState } from "./state";

export function createLoadStatusView(state: LoadState, renderTable: () => void) {
  function setStatus(source: SourceId): void {
    const result = state.results.get(source);
    const from =
      result?.origin === "file"
        ? " from file"
        : result?.origin === "api" && source === "tigertag"
          ? " from cloud"
          : result?.origin === "api" && (source === "bambuddy" || source === "filamentdb")
            ? " from API"
            : "";
    const container = byId(`${source}-status`);
    document.getElementById(`${source}-actions`)?.replaceChildren();
    if (!result) {
      container.replaceChildren(badge("Not loaded", "neutral"));
      return;
    }
    const clearBtn = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        title: `Unload ${SOURCE_LABELS[source]}`,
        "aria-label": `Unload ${SOURCE_LABELS[source]}`,
      },
      "Unload",
    );
    clearBtn.addEventListener("click", () => {
      state.unload(source);
      setStatus(source);
      renderTable();
      byId(`${source}-message`).replaceChildren();
      showToast(`Unloaded ${SOURCE_LABELS[source]}`, "info");
    });
    container.replaceChildren(badge(`${result.spools.length} loaded${from}`, "success"));
    // The summary is a disclosure control, so the Unload button lives in the panel body.
    const actions = document.getElementById(`${source}-actions`);
    if (actions) actions.replaceChildren(clearBtn);
    else container.append(clearBtn);
  }

  function store(result: LoadResult): void {
    if (!state.store(result)) {
      byId(`${result.source}-message`).append(
        notice(
          "warning",
          "Kept on this page only",
          h(
            "p",
            {},
            "Browser storage is full or disabled, so this inventory won't carry over to the Sync step.",
          ),
        ),
      );
    }
    setStatus(result.source);
    renderTable();
  }

  return { store, setStatus };
}
