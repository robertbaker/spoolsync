const ALERT_SELECTOR = '[role="alert"], [role="status"]';
const DISMISS_SELECTOR = "[data-alert-dismiss]";

const boundRoots = new WeakSet<Document>();

function getDismissButton(target: EventTarget | null): HTMLButtonElement | null {
  return target instanceof Element ? target.closest<HTMLButtonElement>(DISMISS_SELECTOR) : null;
}

function handleAlertDismissClick(event: MouseEvent): void {
  const button = getDismissButton(event.target);
  if (!button) return;

  const alert = button.closest<HTMLElement>(ALERT_SELECTOR);
  if (!alert) return;

  if (button.dataset["alertDismissAction"] === "remove") {
    alert.remove();
    return;
  }

  alert.classList.add("hidden");
}

export function initAlertDismiss(root: Document = document): void {
  if (boundRoots.has(root)) return;
  root.addEventListener("click", handleAlertDismissClick);
  boundRoots.add(root);
}

if (typeof document !== "undefined") {
  initAlertDismiss();
}
