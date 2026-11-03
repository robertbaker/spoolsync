import { PwaController, type InstallPromptEvent } from "./pwa/controller";
import { createPwaView } from "./pwa/view";

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const controller: PwaController = new PwaController(
  createPwaView({
    install: () => void controller.install(),
    update: () => void controller.applyUpdate(),
  }),
  standalone,
);

window.addEventListener("beforeinstallprompt", (event) =>
  controller.beforeInstallPrompt(event as InstallPromptEvent),
);
window.addEventListener("appinstalled", () => controller.installed());
window.addEventListener("online", () => controller.setOnline(true));
window.addEventListener("offline", () => controller.setOnline(false));
controller.setOnline(navigator.onLine);

// Only built sites register a worker: `astro dev` serves unbundled files that must never be cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const container = navigator.serviceWorker;
  // A first install claims the page without a reload; only an update the visitor asked for reloads.
  let reloading = false;
  container.addEventListener("controllerchange", () => {
    if (!controller.applying || reloading) return;
    reloading = true;
    location.reload();
  });

  const watch = (registration: ServiceWorkerRegistration) => {
    const waitIfUpdate = (worker: ServiceWorker | null) => {
      // With no controller this is the first install, not an update.
      if (worker && container.controller) controller.updateWaiting(worker);
    };
    waitIfUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") waitIfUpdate(installing);
      });
    });
  };

  container.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(watch, () => undefined);
}
