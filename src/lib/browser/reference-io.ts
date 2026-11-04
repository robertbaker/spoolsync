import type { ReferenceIO, ReferenceResponse } from "@spoolsync/core/core/reference";

/** Waits, and stops early (rejecting like a cancelled fetch) if the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The wait was cancelled.", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The wait was cancelled.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The browser's network, clock and timers for the reference fetch layer. Requests carry no
 * cookies or credentials and no referrer, so a reference service learns nothing about the visitor
 * beyond the request itself. The page is the only thing that ever calls these services; SpoolSync
 * has no server that could.
 */
export const browserReferenceIO: ReferenceIO = {
  fetch: (url, init) =>
    fetch(url, {
      ...init,
      method: "GET",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "follow",
    }) as Promise<ReferenceResponse>,
  sleep,
  now: () => Date.now(),
};
