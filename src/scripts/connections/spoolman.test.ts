import { expect, mock, test } from "bun:test";

import { wireSpoolmanConnection } from "./spoolman";

test("a connection test still running when the connection is forgotten does not re-save it", async () => {
  const root = document.createElement("div");
  root.innerHTML = `<span id="spoolman-status-badge"></span><div id="spoolman-result"></div>
    <form id="spoolman-form"><input id="spoolman-url" value="http://spoolman.test">
    <input id="spoolman-token" value="tok"><input id="spoolman-remember" type="checkbox">
    <button id="spoolman-test"></button></form><button id="spoolman-forget"></button>`;
  document.body.append(root);
  let finish!: (value: { code: string }) => void;
  const diagnoseConnection = mock(
    () => new Promise<{ code: string }>((resolve) => (finish = resolve)),
  );
  const save = mock(() => {});
  const clear = mock(() => {});
  try {
    wireSpoolmanConnection({
      browserEnvironment: async () => ({}),
      diagnoseConnection: diagnoseConnection as never,
      normalizeBaseUrl: ((value: string) => new URL(value)) as never,
      loadSpoolmanConnection: () => null,
      saveSpoolmanConnection: save,
      clearSpoolmanConnection: clear,
    } as never);
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    root.querySelector<HTMLButtonElement>("#spoolman-forget")!.click();
    finish({ code: "ok" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>("#spoolman-test")!.disabled).toBe(false);
  } finally {
    root.remove();
  }
});
