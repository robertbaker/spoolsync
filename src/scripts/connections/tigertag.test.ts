import { expect, mock, test } from "bun:test";

import { wireTigertagConnection } from "./tigertag";

test("failed TigerTag sign-in clears the password and restores its button", async () => {
  const root = document.createElement("div");
  root.innerHTML = `<span id="tigertag-status-badge"></span><div id="tigertag-signed-in"></div><span id="tigertag-email"></span>
    <div id="tigertag-result"></div><button id="tigertag-sign-out"></button><form id="tigertag-form">
    <input id="tigertag-email-input" value=" test@example.com "><input id="tigertag-password" value="test-password">
    <input id="tigertag-remember" type="checkbox"><button id="tigertag-sign-in"></button></form>`;
  document.body.append(root);
  const signIn = mock(async () => {
    throw new Error("Rejected credentials");
  });
  const saveTigertagSession = mock(() => {});
  try {
    wireTigertagConnection({
      signIn,
      saveTigertagSession,
      loadTigertagSession: () => null,
      clearTigertagSession: () => {},
    });
    const button = root.querySelector<HTMLButtonElement>("#tigertag-sign-in")!;
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(signIn).toHaveBeenCalledWith("test@example.com", "test-password");
    expect(saveTigertagSession).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLInputElement>("#tigertag-password")!.value).toBe("");
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(root.querySelector("#tigertag-result")!.textContent).toContain("Rejected credentials");
    expect(root.querySelector<HTMLFormElement>("form")!.hidden).toBe(false);
  } finally {
    root.remove();
  }
});
