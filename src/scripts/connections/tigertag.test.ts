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

test("aria-invalid clears on input/valid submit and sign-out focuses email input", async () => {
  const root = document.createElement("div");
  root.innerHTML = `<span id="tigertag-status-badge"></span><div id="tigertag-signed-in" hidden></div><span id="tigertag-email"></span>
    <div id="tigertag-result"></div><button id="tigertag-sign-out"></button><form id="tigertag-form">
    <input id="tigertag-email-input" value=""><input id="tigertag-password" value="">
    <input id="tigertag-remember" type="checkbox"><button id="tigertag-sign-in"></button></form>`;
  document.body.append(root);
  let session: { email: string } | null = null;
  try {
    wireTigertagConnection({
      signIn: (async (email: string) => ({ email, token: "t" })) as never,
      saveTigertagSession: ((s: { email: string }) => {
        session = s;
      }) as never,
      loadTigertagSession: (() => session) as never,
      clearTigertagSession: () => {
        session = null;
      },
    });

    const emailInput = root.querySelector<HTMLInputElement>("#tigertag-email-input")!;
    const passwordInput = root.querySelector<HTMLInputElement>("#tigertag-password")!;
    const form = root.querySelector("form")!;

    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");

    emailInput.value = "a@b.com";
    emailInput.dispatchEvent(new Event("input"));
    expect(emailInput.hasAttribute("aria-invalid")).toBe(false);

    passwordInput.value = "secret";
    passwordInput.dispatchEvent(new Event("input"));
    expect(passwordInput.hasAttribute("aria-invalid")).toBe(false);

    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLElement>("#tigertag-signed-in")!.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>("#tigertag-sign-out")!.click();
    expect(root.querySelector<HTMLElement>("#tigertag-signed-in")!.hidden).toBe(true);
    expect(document.activeElement).toBe(emailInput);
  } finally {
    root.remove();
  }
});
