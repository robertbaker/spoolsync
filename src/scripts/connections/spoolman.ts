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

import { byId, h, notice, showToast } from "../dom";
import { connectionDiagnosisNotice } from "../spoolman-help";
import { badge, loadInventoriesLink } from "./presentation";
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
    dependencies.saveSpoolmanConnection(connection);

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
        updateSpoolmanBadge(true);
        showToast("Spoolman connection verified", "success");
        result.append(loadInventoriesLink());
      } else {
        spoolmanBadge.replaceChildren(badge("Check setup", "warning"));
      }
    } catch (error) {
      result.replaceChildren(notice("error", "Test failed", h("p", {}, (error as Error).message)));
      spoolmanBadge.replaceChildren(badge("Error", "warning"));
    } finally {
      testButton.disabled = false;
      testButton.removeAttribute("aria-busy");
    }
  });

  byId("spoolman-forget").addEventListener("click", () => {
    dependencies.clearSpoolmanConnection();
    form.reset();
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
