import { expect, test } from "bun:test";

import { connectionDiagnosisNotice } from "./spoolman-help";

test("a detected CORS block announces install instructions for this exact origin", () => {
  const element = connectionDiagnosisNotice({
    code: "cors",
    title: "Site blocked",
    detail: "Server answered but cross-origin access failed.",
    envLine: "SPOOLMAN_CORS_ORIGIN=http://127.0.0.1:4324",
  });
  expect(element.getAttribute("role")).toBe("alert");
  expect(element.querySelector("details")?.open).toBe(true);
  expect(element.textContent).toContain("SPOOLMAN_CORS_ORIGIN: http://127.0.0.1:4324");
  expect(element.textContent).toContain("docker compose up -d --no-deps spoolman");
  expect(element.textContent).toContain("--env-file");
  expect(element.textContent).toContain("sudo systemctl restart Spoolman");
  expect(element.textContent).toContain("Source / manual process");
  expect(element.textContent).toContain("Docker run / container managers");
});

test("an auth failure does not incorrectly prescribe a CORS change", () => {
  const element = connectionDiagnosisNotice({
    code: "auth",
    title: "Authentication required",
    detail: "Supply the API token.",
  });
  expect(element.querySelector("details")).toBeNull();
});
