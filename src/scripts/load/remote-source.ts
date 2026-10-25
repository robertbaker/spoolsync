import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { h, notice } from "../dom";
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
}

/** Shared request lifecycle; source bindings supply credentials, adapter loading and messages. */
export function wireRemoteSource(
  { state, store }: LoadContext,
  options: RemoteSourceOptions,
): void {
  const { source, button, message } = options;
  button.addEventListener("click", async () => {
    const request = options.prepare();
    if (!request) return;
    const current = state.nextRevision(source);
    button.disabled = true;
    message.replaceChildren(request.loading);
    try {
      const result = await request.load();
      if (!state.isCurrent(source, current)) return;
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
      if (options.finish) options.finish();
      else button.disabled = false;
    }
  });
}
