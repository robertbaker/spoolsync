import type {
  browserEnvironment,
  diagnoseConnection,
  normalizeBaseUrl,
} from "@spoolsync/core/adapters/spoolman";

import type { loadSpoolmanConnection, saveSpoolmanConnection } from "~/lib/browser/storage";
import { t } from "~/lib/i18n";

import { h, notice } from "../dom";
import { connectionDiagnosisNotice } from "../spoolman-help";

export interface SpoolmanConnectDependencies {
  browserEnvironment: typeof browserEnvironment;
  diagnoseConnection: typeof diagnoseConnection;
  normalizeBaseUrl: typeof normalizeBaseUrl;
  loadSpoolmanConnection: typeof loadSpoolmanConnection;
  /** Saves the connection and tells the rest of the page it changed. */
  saveSpoolmanConnection: typeof saveSpoolmanConnection;
  /** Closes the guide and starts the page's own "Fetch spools" load. */
  fetchSpools(): void;
}

const INPUT =
  "mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * The guide's alternative to exporting a file: type the address where Spoolman or Spoolman-NG
 * opens, test it with the same diagnosis as the Connections page, then fetch straight from the
 * server.
 */
export function spoolmanConnectPanel(deps: SpoolmanConnectDependencies): HTMLElement {
  const stored = deps.loadSpoolmanConnection();
  const url = h("input", {
    id: "setup-spoolman-url",
    type: "url",
    inputmode: "url",
    autocomplete: "url",
    placeholder: "http://192.168.1.20:7912",
    class: INPUT,
  });
  url.value = stored?.baseUrl ?? "";
  const token = h("input", {
    id: "setup-spoolman-token",
    type: "password",
    autocomplete: "off",
    spellcheck: "false",
    class: INPUT,
  });
  token.value = stored?.token ?? "";
  const connect = h("button", { type: "submit", class: PRIMARY }, t("wizard.spoolman.connect"));
  const result = h("div", { class: "mt-3", "aria-live": "polite" });

  const form = h(
    "form",
    { class: "mt-3 grid gap-3", novalidate: "" },
    h(
      "label",
      { class: "text-sm font-medium", for: "setup-spoolman-url" },
      t("wizard.spoolman.address"),
      url,
    ),
    h(
      "label",
      { class: "text-sm font-medium", for: "setup-spoolman-token" },
      t("wizard.spoolman.token"),
      token,
    ),
    h("div", {}, connect),
    result,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let baseUrl: string;
    try {
      baseUrl = deps.normalizeBaseUrl(url.value).toString().replace(/\/$/, "");
    } catch (error) {
      result.replaceChildren(
        notice("error", t("wizard.spoolman.badAddress"), h("p", {}, (error as Error).message)),
      );
      url.focus();
      return;
    }
    url.value = baseUrl;
    // Session-only token unless the person already chose to remember one on the Connections page.
    const connection = {
      baseUrl,
      token: token.value,
      rememberToken: stored?.rememberToken ?? false,
    };
    deps.saveSpoolmanConnection(connection);
    connect.disabled = true;
    connect.setAttribute("aria-busy", "true");
    result.replaceChildren(notice("info", t("wizard.spoolman.testing"), h("p", {}, baseUrl)));
    try {
      const diagnosis = await deps.diagnoseConnection(connection, await deps.browserEnvironment());
      result.replaceChildren(connectionDiagnosisNotice(diagnosis));
      if (diagnosis.code === "ok") {
        const fetch = h("button", { type: "button", class: PRIMARY }, t("wizard.spoolman.fetch"));
        fetch.addEventListener("click", () => deps.fetchSpools());
        result.append(h("div", { class: "mt-3" }, fetch));
      }
    } catch (error) {
      result.replaceChildren(
        notice("error", t("wizard.spoolman.failed"), h("p", {}, (error as Error).message)),
      );
    } finally {
      connect.disabled = false;
      connect.removeAttribute("aria-busy");
    }
  });

  return h(
    "section",
    { class: "mt-4 rounded-lg border bg-muted/20 p-3" },
    h("h3", { class: "text-sm font-semibold" }, t("wizard.spoolman.heading")),
    h("p", { class: "mt-1 text-xs text-muted-foreground" }, t("wizard.spoolman.hint")),
    form,
  );
}
