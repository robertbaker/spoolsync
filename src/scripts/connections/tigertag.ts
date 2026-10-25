import type { signIn } from "@spoolsync/core/adapters/tigertag/cloud";

import type {
  clearTigertagSession,
  loadTigertagSession,
  saveTigertagSession,
} from "~/lib/browser/storage";

import { byId, h, notice, showToast } from "../dom";
import { badge, loadInventoriesLink } from "./presentation";
export interface TigertagConnectionDependencies {
  signIn: typeof signIn;
  clearTigertagSession: typeof clearTigertagSession;
  loadTigertagSession: typeof loadTigertagSession;
  saveTigertagSession: typeof saveTigertagSession;
}
export function wireTigertagConnection(dependencies: TigertagConnectionDependencies): void {
  const tigertagBadge = byId<HTMLSpanElement>("tigertag-status-badge");
  const tigertagForm = byId<HTMLFormElement>("tigertag-form");
  const tigertagSignedIn = byId("tigertag-signed-in");
  const tigertagResult = byId("tigertag-result");
  const tigertagButton = byId<HTMLButtonElement>("tigertag-sign-in");

  function showTigertag(): void {
    const current = dependencies.loadTigertagSession();
    tigertagSignedIn.hidden = !current;
    tigertagForm.hidden = !!current;
    byId("tigertag-email").textContent = current?.email ?? "";
    tigertagBadge.replaceChildren(
      current ? badge("Signed in", "success") : badge("Not signed in", "neutral"),
    );
  }
  showTigertag();

  tigertagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = byId<HTMLInputElement>("tigertag-email-input").value.trim();
    const passwordInput = byId<HTMLInputElement>("tigertag-password");
    if (!email || !passwordInput.value) {
      tigertagResult.replaceChildren(notice("error", "Enter your TigerTag email and password"));
      return;
    }
    tigertagButton.disabled = true;
    tigertagButton.setAttribute("aria-busy", "true");
    tigertagResult.replaceChildren(notice("info", "Signing in…"));
    try {
      const session = await dependencies.signIn(email, passwordInput.value);
      dependencies.saveTigertagSession(
        session,
        byId<HTMLInputElement>("tigertag-remember").checked,
      );
      showToast("Signed in to TigerTag", "success");
      tigertagResult.replaceChildren(
        notice("success", "Signed in to TigerTag", loadInventoriesLink()),
      );
      showTigertag();
    } catch (error) {
      tigertagResult.replaceChildren(
        notice("error", "Could not sign in", h("p", { class: "mt-1" }, (error as Error).message)),
      );
    } finally {
      passwordInput.value = "";
      tigertagButton.disabled = false;
      tigertagButton.removeAttribute("aria-busy");
    }
  });

  byId("tigertag-sign-out").addEventListener("click", () => {
    dependencies.clearTigertagSession();
    showToast("Signed out of TigerTag", "info");
    tigertagResult.replaceChildren(
      notice(
        "info",
        "Signed out",
        h("p", {}, "The TigerTag session was removed from this browser."),
      ),
    );
    showTigertag();
  });
}
