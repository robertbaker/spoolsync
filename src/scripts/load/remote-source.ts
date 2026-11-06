import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { buttonClass, h, notice } from "../dom";
import type { LoadContext } from "./state";

export interface RemoteLoadRequest {
  loading: HTMLElement;
  load(): Promise<LoadResult>;
  success(result: LoadResult): HTMLElement[];
}

export interface RemoteSourceOptions {
  source: SourceId;
  button: HTMLButtonElement;
  message: HTMLElement;
  prepare(): RemoteLoadRequest | null;
  error?(error: unknown): HTMLElement;
  finish?(): void;
  /** How long to wait before offering a retry. Defaults to {@link FETCH_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** A LAN server that does not answer is better reported than waited on forever. */
export const FETCH_TIMEOUT_MS = 45_000;

const TIMED_OUT = Symbol("timed out");

/**
 * Shared request lifecycle; source bindings supply credentials, adapter loading and messages.
 *
 * While a request runs the button, its message area and the service's tile are marked busy, and the
 * loading notice carries a Cancel button. Cancelling and timing out both bump the source's request
 * revision, so a response that arrives later is rejected like any other stale one. The adapters do
 * not take an abort signal, so this stops waiting for the server rather than closing the
 * connection.
 */
export function wireRemoteSource(
  { state, store }: LoadContext,
  options: RemoteSourceOptions,
): void {
  const { source, button, message } = options;
  const tile = document.querySelector<HTMLElement>(`[data-tile="${source}"]`);
  const idleLabel = [...button.childNodes];
  // A pill beside the tile's status badge, so a fetch is visible even when the panel is closed.
  // It lives outside the badge itself, which is rebuilt whenever the panel's own status changes.
  const busyPill = h(
    "span",
    {
      "data-tile-busy": "",
      class:
        "shrink-0 self-start rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-[0.68rem] font-medium",
    },
    "Fetching…",
  );

  const setBusy = (busy: boolean): void => {
    if (busy) {
      button.setAttribute("aria-busy", "true");
      message.setAttribute("aria-busy", "true");
      tile?.setAttribute("aria-busy", "true");
      tile?.classList.add("motion-safe:animate-pulse");
      tile?.querySelector("[data-tile-status]")?.after(busyPill);
      button.replaceChildren("Fetching…");
    } else {
      button.removeAttribute("aria-busy");
      message.removeAttribute("aria-busy");
      tile?.removeAttribute("aria-busy");
      tile?.classList.remove("motion-safe:animate-pulse");
      busyPill.remove();
      button.replaceChildren(...idleLabel);
    }
  };

  const settle = (): void => {
    setBusy(false);
    if (options.finish) options.finish();
    else button.disabled = false;
  };

  // The newest click owns the button; an older request finishing late must not hand it back.
  let latestClick = 0;

  button.addEventListener("click", async () => {
    const request = options.prepare();
    if (!request) return;
    const current = state.nextRevision(source);
    const click = ++latestClick;
    let finished = false;
    const finishRequest = (): void => {
      if (finished || click !== latestClick) return;
      finished = true;
      settle();
    };
    button.disabled = true;
    setBusy(true);

    const cancel = h("button", { type: "button", class: buttonClass({ size: "xs" }) }, "Cancel");
    cancel.addEventListener("click", () => {
      if (!state.isCurrent(source, current)) return;
      state.nextRevision(source);
      message.replaceChildren(notice("info", "Cancelled. Nothing was loaded."));
      finishRequest();
    });
    request.loading.append(h("div", { class: "mt-3" }, cancel));
    message.replaceChildren(request.loading);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), options.timeoutMs ?? FETCH_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([request.load(), timeout]);
      if (!state.isCurrent(source, current)) return;
      if (result === TIMED_OUT) {
        state.nextRevision(source);
        const retry = h("button", { type: "button", class: buttonClass({ size: "xs" }) }, "Retry");
        retry.addEventListener("click", () => button.click());
        message.replaceChildren(
          notice(
            "warning",
            `${SOURCE_LABELS[source]} is not answering`,
            h(
              "p",
              { class: "mt-1" },
              "Check that the server is running and reachable from this browser, then try again.",
            ),
            h("div", { class: "mt-3" }, retry),
          ),
        );
        finishRequest();
        return;
      }
      message.replaceChildren(...request.success(result));
      store(result);
    } catch (error) {
      if (!state.isCurrent(source, current)) return;
      message.replaceChildren(
        options.error
          ? options.error(error)
          : notice(
              "error",
              `Could not load ${SOURCE_LABELS[source]}`,
              h("p", { class: "mt-1" }, (error as Error).message),
            ),
      );
    } finally {
      clearTimeout(timer);
      finishRequest();
    }
  });
}
