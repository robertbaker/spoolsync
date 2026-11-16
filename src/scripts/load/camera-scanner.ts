import type { CommonSpool } from "@spoolsync/core/core/model";

import type { ScanResult } from "~/lib/labels/scan";

import { h } from "../dom";

interface DetectedCode {
  rawValue?: string;
}

interface Detector {
  detect(video: HTMLVideoElement): Promise<DetectedCode[]>;
}

interface DetectorConstructor {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?(): Promise<string[]>;
}

interface CameraHooks {
  read(code: string): ScanResult;
  open(spool: CommonSpool): void;
}

const FORMATS = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e"];

/** Camera work is opt-in, stays in this tab, and stops as soon as the dialog closes. */
export function wireCameraScanner(button: HTMLButtonElement, hooks: CameraHooks): void {
  let dialog: HTMLDialogElement | undefined;
  let video: HTMLVideoElement;
  let status: HTMLElement;
  let choices: HTMLElement;
  let stream: MediaStream | undefined;
  let run = 0;

  function stop(): void {
    run++;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    if (video) video.srcObject = null;
  }

  function build(): HTMLDialogElement {
    video = h("video", {
      class: "max-h-[55dvh] w-full rounded-xl bg-black object-contain",
      autoplay: "",
      muted: "",
      playsinline: "",
      "aria-label": "Camera view for scanning a spool label",
    }) as HTMLVideoElement;
    video.playsInline = true;
    status = h("p", { class: "mt-3 text-sm", role: "status", "aria-live": "polite" });
    choices = h("div", { class: "mt-2 grid gap-2" });
    const close = h(
      "button",
      {
        type: "button",
        class:
          "rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted",
      },
      "Close scanner",
    );
    const element = h(
      "dialog",
      {
        id: "camera-scan-dialog",
        closedby: "any",
        "aria-labelledby": "camera-scan-title",
        class:
          "m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border bg-background p-0 text-foreground shadow-layered backdrop:bg-black/40",
      },
      h(
        "div",
        { class: "p-4 sm:p-6" },
        h(
          "div",
          { class: "flex items-start justify-between gap-3" },
          h(
            "div",
            {},
            h("h2", { id: "camera-scan-title", class: "text-lg font-bold" }, "Scan a spool"),
            h(
              "p",
              { class: "mt-1 text-xs text-muted-foreground" },
              "Point the camera at a SpoolSync QR label or a product barcode. Images stay in this browser.",
            ),
          ),
          close,
        ),
        video,
        status,
        choices,
      ),
    ) as HTMLDialogElement;
    close.addEventListener("click", () => element.close());
    element.addEventListener("close", stop);
    document.body.append(element);
    return element;
  }

  function handleCode(code: string): boolean {
    const result = hooks.read(code);
    choices.replaceChildren();
    if (result.kind === "spool") {
      stop();
      dialog?.close();
      hooks.open(result.spool);
      return true;
    }
    if (result.kind === "ambiguous") {
      status.textContent = `${result.spools.length} loaded spools share this barcode. Choose one:`;
      choices.replaceChildren(
        ...result.spools.map((spool) => {
          const label =
            [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;
          const choose = h(
            "button",
            {
              type: "button",
              class:
                "rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
            },
            `${label} · ${spool.sourceId}`,
          );
          choose.addEventListener("click", () => {
            stop();
            dialog?.close();
            hooks.open(spool);
          });
          return choose;
        }),
      );
      return true;
    }
    status.textContent =
      result.kind === "not-loaded"
        ? `No loaded spool has the code ${result.code}. Load that service first.`
        : "That code is not a loaded spool label or barcode. Keep scanning or close the camera.";
    return false;
  }

  async function scan(detector: Detector, token: number): Promise<void> {
    if (token !== run || !dialog?.open || !stream) return;
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const detected = await detector.detect(video);
        const code = detected.find((entry) => entry.rawValue)?.rawValue;
        if (code && handleCode(code)) return;
      }
    } catch {
      status.textContent = "Could not read this camera frame. Adjust the label and try again.";
    }
    if (token === run && dialog?.open) window.setTimeout(() => void scan(detector, token), 140);
  }

  async function start(): Promise<void> {
    dialog ??= build();
    if (dialog.open) return;
    dialog.showModal();
    const request = ++run;
    choices.replaceChildren();
    status.textContent = "Starting camera…";
    const DetectorApi = (window as Window & { BarcodeDetector?: DetectorConstructor })
      .BarcodeDetector;
    if (!DetectorApi) {
      status.textContent =
        "Camera scanning is not available in this browser. Use a barcode scanner that types into the filter box, or paste the label code there and press Enter.";
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      status.textContent =
        "Camera access needs a secure page and a browser that supports camera input.";
      return;
    }

    try {
      const supported = DetectorApi.getSupportedFormats
        ? await DetectorApi.getSupportedFormats()
        : FORMATS;
      const formats = FORMATS.filter((format) => supported.includes(format));
      if (!formats.length) {
        status.textContent =
          "This browser cannot read QR labels or common product barcodes. Use a scanner that types into the filter box instead.";
        return;
      }
      const detector = new DetectorApi({ formats });
      const camera = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (request !== run || !dialog.open) {
        for (const track of camera.getTracks()) track.stop();
        return;
      }
      stream = camera;
      video.srcObject = stream;
      await video.play();
      if (request !== run || !dialog.open) {
        stop();
        return;
      }
      status.textContent = "Camera ready. Hold a label steady in view.";
      void scan(detector, request);
    } catch (error) {
      stop();
      const reason = error instanceof DOMException ? error.name : "";
      status.textContent =
        reason === "NotAllowedError" || reason === "SecurityError"
          ? "Camera permission was denied. Allow camera access in your browser settings, then try again."
          : reason === "NotFoundError"
            ? "No camera was found on this device."
            : "Could not start the camera. Close other apps using it and try again.";
    }
  }

  button.addEventListener("click", () => void start());
  window.addEventListener("pagehide", stop, { once: true });
}
