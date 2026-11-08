import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import type { ReferenceController } from "./reference-controller";
import type { wireReferencePanel } from "./reference-view";

type ReferenceView = { wireReferencePanel: typeof wireReferencePanel };

/**
 * The Reference data panel is a large part of the Load page and has nothing to show until a spool
 * is loaded, so its code is fetched then instead of with the page. Until it arrives the panel is
 * absent and no spool has a selected reference; `onReady` lets the page redraw what depends on
 * one.
 */
export function wireLazyReferencePanel(
  root: HTMLElement,
  results: ReadonlyMap<SourceId, LoadResult>,
  onReady: () => void,
  load: () => Promise<ReferenceView> = () => import("./reference-view"),
): { update(): void; selectedFor: ReferenceController["selectedFor"] } {
  let panel: ReturnType<typeof wireReferencePanel> | null = null;
  let loading = false;

  function start(): void {
    loading = true;
    load().then(
      (module) => {
        panel = module.wireReferencePanel(root, results);
        panel.update();
        onReady();
      },
      // A failed download (offline, say) is tried again on the next redraw.
      () => {
        loading = false;
      },
    );
  }

  return {
    update() {
      if (panel) return panel.update();
      root.hidden = results.size === 0;
      if (results.size > 0 && !loading) start();
    },
    selectedFor: (key) => panel?.controller.selectedFor(key) ?? null,
  };
}
