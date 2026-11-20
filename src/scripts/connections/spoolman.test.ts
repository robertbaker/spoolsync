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

test("aria-invalid clears on input, valid submit, and forget reset", async () => {
  const root = document.createElement("div");
  root.innerHTML = `<span id="spoolman-status-badge"></span><div id="spoolman-result"></div>
    <form id="spoolman-form"><input id="spoolman-url" value="not a url">
    <input id="spoolman-token" value=""><input id="spoolman-remember" type="checkbox">
    <button id="spoolman-test"></button></form><button id="spoolman-forget"></button>`;
  document.body.append(root);
  try {
    wireSpoolmanConnection({
      browserEnvironment: async () => ({}),
      diagnoseConnection: async () => ({ code: "ok" }) as never,
      normalizeBaseUrl: ((value: string) => {
        if (!value.startsWith("http")) throw new Error("Invalid URL");
        return new URL(value);
      }) as never,
      loadSpoolmanConnection: () => null,
      saveSpoolmanConnection: () => {},
      clearSpoolmanConnection: () => {},
    } as never);

    const urlInput = root.querySelector<HTMLInputElement>("#spoolman-url")!;
    const form = root.querySelector("form")!;

    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");

    urlInput.value = "http://spoolman.test";
    urlInput.dispatchEvent(new Event("input"));
    expect(urlInput.hasAttribute("aria-invalid")).toBe(false);

    // Also cleared on forget reset even if aria-invalid was set.
    urlInput.value = "bad";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");
    root.querySelector<HTMLButtonElement>("#spoolman-forget")!.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(urlInput.hasAttribute("aria-invalid")).toBe(false);
  } finally {
    root.remove();
  }
});
