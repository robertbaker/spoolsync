/** Fired on `document` to open the first-run guide when the Load page is showing. */
export const SETUP_EVENT = "spoolsync:open-setup";

export const isLoadPath = (pathname: string) => pathname.replace(/\/+$/, "") === "/load";

/** Opens the setup guide, going to the Load page first when it is not the current page. */
export function openSetupGuide(): void {
  if (isLoadPath(location.pathname)) document.dispatchEvent(new CustomEvent(SETUP_EVENT));
  else location.assign("/load?setup=1");
}

/** Wires every `[data-open-setup]` control (the footer link). */
export function wireSetupTriggers(): void {
  for (const trigger of document.querySelectorAll("[data-open-setup]"))
    trigger.addEventListener("click", openSetupGuide);
}
