import type {
  browserEnvironment,
  diagnoseConnection,
  normalizeBaseUrl,
} from "@spoolsync/core/adapters/spoolman";

import type {
  clearSpoolmanConnection,
  loadSpoolmanConnection,
  saveSpoolmanConnection,
} from "~/lib/browser/storage";

import { confirmDialog } from "../confirm-dialog";
import { byId, h, notice, showToast } from "../dom";
import { connectionDiagnosisNotice } from "../spoolman-help";
import { badge, nextStepHint } from "./presentation";
export interface SpoolmanConnectionDependencies {
  browserEnvironment: typeof browserEnvironment;
  diagnoseConnection: typeof diagnoseConnection;
  normalizeBaseUrl: typeof normalizeBaseUrl;
  clearSpoolmanConnection: typeof clearSpoolmanConnection;
  loadSpoolmanConnection: typeof loadSpoolmanConnection;
  saveSpoolmanConnection: typeof saveSpoolmanConnection;
}
export function wireSpoolmanConnection(dependencies: SpoolmanConnectionDependencies): void {
  const form = byId<HTMLFormElement>("spoolman-form");
  const urlInput = byId<HTMLInputElement>("spoolman-url");
  const tokenInput = byId<HTMLInputElement>("spoolman-token");
  const rememberInput = byId<HTMLInputElement>("spoolman-remember");
  const testButton = byId<HTMLButtonElement>("spoolman-test");
  const result = byId<HTMLDivElement>("spoolman-result");
  const spoolmanBadge = byId<HTMLSpanElement>("spoolman-status-badge");

  function updateSpoolmanBadge(configured: boolean, host?: string): void {
    spoolmanBadge.replaceChildren(
      configured
        ? badge(host ? `Connected: ${host}` : "Configured", "success")
        : badge("Not configured", "neutral"),
    );
  }

  const stored = dependencies.loadSpoolmanConnection();
  if (stored) {
    urlInput.value = stored.baseUrl;
    tokenInput.value = stored.token ?? "";
    rememberInput.checked = stored.rememberToken;
    updateSpoolmanBadge(true);
  } else {
    updateSpoolmanBadge(false);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.replaceChildren();

    let baseUrl: string;
    try {
      baseUrl = dependencies.normalizeBaseUrl(urlInput.value).toString().replace(/\/$/, "");
    } catch (error) {
      result.replaceChildren(
        notice("error", "Check the address", h("p", {}, (error as Error).message)),
      );
      urlInput.focus();
      return;
    }
    urlInput.value = baseUrl;
    const connection = { baseUrl, token: tokenInput.value, rememberToken: rememberInput.checked };
    // Saving announces a connection change, which drops data fetched from the previous server, so
    // only a connection that passed the test replaces the saved one.
    const hadConnection = dependencies.loadSpoolmanConnection() !== null;
    const notSaved = () =>
      nextStepHint(
        hadConnection
          ? "Not saved: the previous connection is still in use."
          : "Not saved: fix the problem above and test again.",
      );

    testButton.disabled = true;
    testButton.setAttribute("aria-busy", "true");
    result.replaceChildren(notice("info", "Testing…", h("p", {}, `Contacting ${baseUrl}`)));
    try {
      const diagnosis = await dependencies.diagnoseConnection(
        connection,
        await dependencies.browserEnvironment(),
      );
      result.replaceChildren(connectionDiagnosisNotice(diagnosis));
      if (diagnosis.code === "ok") {
        dependencies.saveSpoolmanConnection(connection);
        updateSpoolmanBadge(true);
        showToast("Spoolman connection verified", "success");
        result.append(nextStepHint("Ready. Use Fetch spools above to load this server."));
      } else {
        spoolmanBadge.replaceChildren(badge("Check setup", "warning"));
        result.append(notSaved());
      }
    } catch (error) {
      result.replaceChildren(notice("error", "Test failed", h("p", {}, (error as Error).message)));
      spoolmanBadge.replaceChildren(badge("Error", "warning"));
      result.append(notSaved());
    } finally {
      testButton.disabled = false;
      testButton.removeAttribute("aria-busy");
    }
  });

  byId("spoolman-forget").addEventListener("click", async () => {
    // Nothing saved means nothing to lose: just clear what was typed.
    if (dependencies.loadSpoolmanConnection()) {
      const confirmed = await confirmDialog({
        title: "Forget this Spoolman connection?",
        body: "The address and token are removed from this browser, and spools fetched from this server are unloaded.",
        confirmLabel: "Forget",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    dependencies.clearSpoolmanConnection();
    form.reset();
    urlInput.focus();
    updateSpoolmanBadge(false);
    showToast("Spoolman connection cleared", "info");
    result.replaceChildren(
      notice(
        "info",
        "Connection cleared",
        h("p", {}, "The address and token were removed from this browser."),
      ),
    );
  });
}
