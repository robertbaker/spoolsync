import { byId, showToast } from "../dom";
import { corsInstallHelp } from "../spoolman-help";

export function wireCorsHelp(): void {
  const corsOriginLine = `SPOOLMAN_CORS_ORIGIN=${location.origin}`;
  byId("cors-line").textContent = corsOriginLine;
  byId("cors-install-help").append(corsInstallHelp(corsOriginLine));

  const copyCorsBtn = document.getElementById("copy-cors-btn");
  if (copyCorsBtn) {
    copyCorsBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(corsOriginLine);
        copyCorsBtn.textContent = "Copied!";
        showToast("Copied CORS line to clipboard", "success");
        setTimeout(() => {
          copyCorsBtn.textContent = "Copy";
        }, 1600);
      } catch {
        copyCorsBtn.textContent = "Failed";
      }
    });
  }
}
