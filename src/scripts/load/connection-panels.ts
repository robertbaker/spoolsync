import { loadSpoolmanConnection, loadTigertagSession } from "~/lib/browser/storage";

type Service = "spoolman" | "tigertag";

/**
 * Connection settings live inside the Spoolman and TigerTag panels. Their forms are wired the first
 * time a panel is opened, so the Load page does not pull in the connection code up front.
 */
export function wireConnectionPanels(): void {
  const wired = new Set<Service>();

  async function wire(service: Service): Promise<void> {
    if (wired.has(service)) return;
    wired.add(service);
    const { wireSpoolmanForm, wireTigertagForm } = await import("../connections/wire");
    if (service === "spoolman") wireSpoolmanForm();
    else wireTigertagForm();
  }

  function settings(service: Service): HTMLDetailsElement | null {
    const element = document.getElementById(`${service}-settings`);
    return element instanceof HTMLDetailsElement ? element : null;
  }

  for (const service of ["spoolman", "tigertag"] as const) {
    const details = settings(service);
    if (!details) continue;
    details.addEventListener("toggle", () => {
      if (details.open) void wire(service);
    });
  }

  /** Opens a service's panel and settings, then moves focus to its first field. */
  function reveal(service: Service): void {
    const details = settings(service);
    if (!details) return;
    const panel = details.closest("details[data-panel]");
    if (panel instanceof HTMLDetailsElement) panel.open = true;
    details.open = true;
    void wire(service).then(() => {
      details.querySelector<HTMLInputElement>("input:not([type=hidden]):not([hidden])")?.focus();
    });
  }

  document.addEventListener("click", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>("[data-open-settings]");
    const service = trigger?.dataset["openSettings"];
    if (service === "spoolman" || service === "tigertag") reveal(service);
  });

  // First run: show the form straight away when nothing is configured.
  const spoolman = settings("spoolman");
  if (spoolman && !loadSpoolmanConnection()) spoolman.open = true;
  const tigertag = settings("tigertag");
  if (tigertag && loadTigertagSession()) tigertag.open = false;
  for (const service of ["spoolman", "tigertag"] as const)
    if (settings(service)?.open) void wire(service);
}
