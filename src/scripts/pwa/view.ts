import { h } from "../dom";
import type { PwaView } from "./controller";

/**
 * The offline indicator and the update prompt share one polite status region in the corner of the
 * page. The Install buttons are static markup in the header and are only revealed here.
 */
export function createPwaView(handlers: { install(): void; update(): void }): PwaView {
  // The header renders its actions twice (mobile and desktop), so there is one button per copy.
  const installButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-install-app]")];
  for (const button of installButtons) button.addEventListener("click", handlers.install);

  const offline = h(
    "p",
    {
      id: "offline-indicator",
      class:
        "rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-lg",
    },
    "Offline: using the saved copy of this site",
  );
  const reload = h(
    "button",
    {
      type: "button",
      id: "update-reload",
      class:
        "rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    },
    "Reload to update",
  );
  reload.addEventListener("click", handlers.update);
  const update = h(
    "div",
    {
      id: "update-ready",
      class:
        "flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-xs text-foreground shadow-lg",
    },
    h("span", {}, "A new version of SpoolSync is ready."),
    reload,
  );
  offline.hidden = true;
  update.hidden = true;

  const region = h(
    "div",
    {
      id: "pwa-status",
      role: "status",
      "aria-live": "polite",
      "data-print": "hide",
      class: "fixed bottom-24 left-4 z-50 flex flex-col items-start gap-2 lg:bottom-4",
    },
    offline,
    update,
  );
  document.body.append(region);

  return {
    showInstall(visible) {
      for (const button of installButtons) button.hidden = !visible;
    },
    showOffline(isOffline) {
      offline.hidden = !isOffline;
    },
    showUpdate(visible) {
      update.hidden = !visible;
    },
  };
}
