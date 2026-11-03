/** The browser's install prompt event, which is not in the standard DOM typings. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Presentation the controller drives; the DOM implementation lives in `view.ts`. */
export interface PwaView {
  showInstall(visible: boolean): void;
  showOffline(offline: boolean): void;
  showUpdate(visible: boolean): void;
}

/** The part of a waiting service worker the controller needs. */
export interface WaitingWorker {
  postMessage(message: unknown): void;
}

/**
 * Install, offline, and update state for the app shell. It holds no browser globals: events and the
 * display-mode check are passed in, so each rule can be tested without a browser.
 */
export class PwaController {
  private deferred: InstallPromptEvent | null = null;
  private waiting: WaitingWorker | null = null;
  /** True once the visitor chose to update, so the next controller change reloads the page. */
  applying = false;

  constructor(
    private readonly view: PwaView,
    private readonly isInstalled: () => boolean,
  ) {}

  /** Keeps the browser's prompt for later and offers an Install button instead of the mini-bar. */
  beforeInstallPrompt(event: InstallPromptEvent): void {
    event.preventDefault();
    this.deferred = event;
    this.view.showInstall(!this.isInstalled());
  }

  /** Shows the browser's install prompt. The event can be used once. */
  async install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const event = this.deferred;
    if (!event) return "unavailable";
    this.deferred = null;
    this.view.showInstall(false);
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  }

  installed(): void {
    this.deferred = null;
    this.view.showInstall(false);
  }

  setOnline(online: boolean): void {
    this.view.showOffline(!online);
  }

  /** A new version finished installing in the background and is waiting for the visitor. */
  updateWaiting(worker: WaitingWorker): void {
    this.waiting = worker;
    this.view.showUpdate(true);
  }

  /** Asks the waiting worker to take over; the page reloads when it does. */
  applyUpdate(): boolean {
    if (!this.waiting) return false;
    this.applying = true;
    this.waiting.postMessage({ type: "SKIP_WAITING" });
    this.view.showUpdate(false);
    return true;
  }
}
