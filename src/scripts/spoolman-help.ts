import type { Diagnosis } from "@spoolsync/core/adapters/spoolman/diagnose";

import { copyLine, h, notice } from "./dom";

const paragraph = (text: string) => h("p", { class: "mt-2" }, text);
const code = (text: string) =>
  h(
    "pre",
    { class: "mt-2 overflow-x-auto rounded bg-background p-2 text-xs" },
    h("code", {}, text),
  );

/** Instructions belong to the server being connected, while the allowed origin is this page. */
export function corsInstallHelp(envLine: string, expanded = false): HTMLElement {
  const origin = envLine.slice("SPOOLMAN_CORS_ORIGIN=".length);
  return h(
    "details",
    { class: "mt-3", ...(expanded ? { open: "" } : {}) },
    h(
      "summary",
      { class: "cursor-pointer font-medium" },
      "Apply this setting to your installation",
    ),
    paragraph(
      "Run these steps on the Spoolman host (over SSH if it runs on another machine). Allow the exact SpoolSync origin shown above, including any port and without a trailing slash.",
    ),
    h("h4", { class: "mt-3 font-semibold" }, "Docker Compose / Portainer stacks"),
    paragraph(
      "Add this under your Spoolman service, keeping its existing image, volumes, ports, and other settings:",
    ),
    code(`environment:\n  SPOOLMAN_CORS_ORIGIN: ${origin}`),
    paragraph(
      "From the Compose directory, recreate the service (replace spoolman with your service name, such as spoolman-ng, and keep any --env-file or -f options your setup uses):",
    ),
    code("docker compose up -d --no-deps spoolman"),
    paragraph(
      "Note: docker compose restart does not pick up new environment variables. A .env file in the Compose directory only provides interpolation values unless you pass it via env_file: or reference the variable under environment:. In Portainer, update and redeploy the stack after editing.",
    ),
    h("h4", { class: "mt-3 font-semibold" }, "Docker run / container managers"),
    paragraph(
      "Add this environment flag to your container configuration, then recreate the container with the same data volume and options:",
    ),
    code(`-e ${envLine}`),
    h("h4", { class: "mt-3 font-semibold" }, "Standalone Linux / systemd"),
    paragraph(
      "Add or update this line in your Spoolman .env file (usually ~/Spoolman/.env), then restart the service (adjust the unit name if needed):",
    ),
    code(`${envLine}\nsudo systemctl restart Spoolman`),
    h("h4", { class: "mt-3 font-semibold" }, "Source / manual process"),
    paragraph(
      "Set the variable in the environment or .env file loaded by the server, then stop and restart the process. The built-in scripts/start.sh launcher reads .env automatically; custom process managers must pass the variable to the server process.",
    ),
    paragraph(
      "On Spoolman-NG, if SPOOLMAN_ALLOWED_HOSTS is set, make sure it still includes the Spoolman server hostname. Once updated, return here and test again.",
    ),
    h(
      "p",
      { class: "mt-2" },
      h(
        "a",
        {
          href: "https://github.com/Donkie/Spoolman/wiki/Configuration",
          target: "_blank",
          rel: "noopener noreferrer",
          class: "underline",
        },
        "Official Spoolman configuration instructions",
      ),
      " · ",
      h(
        "a",
        {
          href: "https://github.com/sherrmann/Spoolman-NG",
          target: "_blank",
          rel: "noopener noreferrer",
          class: "underline",
        },
        "Spoolman-NG documentation",
      ),
    ),
  );
}

export function connectionDiagnosisNotice(diagnosis: Diagnosis): HTMLElement {
  const block = notice(
    diagnosis.code === "ok" ? "success" : diagnosis.code === "cors" ? "warning" : "error",
    diagnosis.title,
    paragraph(diagnosis.detail),
    diagnosis.envLine ? copyLine(diagnosis.envLine) : null,
    diagnosis.envLine ? corsInstallHelp(diagnosis.envLine, diagnosis.code === "cors") : null,
    diagnosis.code === "ok"
      ? paragraph("Connection verified. You can now load inventories.")
      : null,
  );
  if (diagnosis.code === "cors") block.setAttribute("role", "alert");
  return block;
}
