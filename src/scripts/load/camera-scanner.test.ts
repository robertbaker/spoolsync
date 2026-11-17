import { afterEach, expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";

import { wireCameraScanner } from "./camera-scanner";

const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, "BarcodeDetector");
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const originalVideoReadyState = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "readyState",
);
const originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "play");
const originalSrcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");
const originalHaveCurrentData = Object.getOwnPropertyDescriptor(
  HTMLMediaElement,
  "HAVE_CURRENT_DATA",
);
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

afterEach(() => {
  document.body.replaceChildren();
  for (const [target, key, original] of [
    [window, "BarcodeDetector", originalBarcodeDetector],
    [navigator, "mediaDevices", originalMediaDevices],
    [window, "isSecureContext", originalSecureContext],
  ] as const) {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  }
  if (originalHaveCurrentData)
    Object.defineProperty(HTMLMediaElement, "HAVE_CURRENT_DATA", originalHaveCurrentData);
  else Reflect.deleteProperty(HTMLMediaElement, "HAVE_CURRENT_DATA");
  if (originalShowModal)
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  for (const [target, key, original] of [
    [HTMLVideoElement.prototype, "readyState", originalVideoReadyState],
    [HTMLMediaElement.prototype, "play", originalPlay],
    [HTMLMediaElement.prototype, "srcObject", originalSrcObject],
  ] as const) {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  }
});

test("closing during barcode format detection does not request camera access", async () => {
  let resolveFormats!: (formats: string[]) => void;
  const formats = new Promise<string[]>((resolve) => {
    resolveFormats = resolve;
  });
  let cameraRequests = 0;
  class MockBarcodeDetector {
    constructor(_options: { formats: string[] }) {}
    static getSupportedFormats() {
      return formats;
    }
  }
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: MockBarcodeDetector,
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia() {
        cameraRequests++;
        return new Promise<MediaStream>(() => {});
      },
    },
  });

  const proto = HTMLDialogElement.prototype as unknown as {
    showModal(): void;
    close(): void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };

  const button = document.createElement("button");
  document.body.append(button);
  wireCameraScanner(button, {
    read: () => ({ kind: "text" }),
    open: () => {},
  });

  button.click();
  const dialog = document.querySelector("#camera-scan-dialog") as HTMLDialogElement;
  dialog.close();
  resolveFormats(["qr_code"]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(cameraRequests).toBe(0);
});

test("an old scanner error cannot replace the status of a newer scan", async () => {
  let rejectFirstFormats!: (error: Error) => void;
  const firstFormats = new Promise<string[]>((_, reject) => {
    rejectFirstFormats = reject;
  });
  let formatRequests = 0;
  let cameraRequests = 0;
  class MockBarcodeDetector {
    constructor(_options: { formats: string[] }) {}
    static getSupportedFormats() {
      formatRequests++;
      return formatRequests === 1 ? firstFormats : Promise.resolve(["qr_code"]);
    }
  }
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: MockBarcodeDetector,
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia() {
        cameraRequests++;
        return new Promise<MediaStream>(() => {});
      },
    },
  });
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal(): void;
    close(): void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };

  const button = document.createElement("button");
  document.body.append(button);
  wireCameraScanner(button, {
    read: () => ({ kind: "text" }),
    open: () => {},
  });

  button.click();
  const dialog = document.querySelector("#camera-scan-dialog") as HTMLDialogElement;
  dialog.close();
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(cameraRequests).toBe(1);

  rejectFirstFormats(new Error("old scan failed"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(dialog.querySelector('[role="status"]')?.textContent).toBe("Starting camera…");
});

test("frame results arriving after close cannot open a spool or replace a newer status", async () => {
  let resolveDetection!: (result: Array<{ rawValue: string }>) => void;
  let rejectSecondDetection!: (error: Error) => void;
  let detectStarted!: () => void;
  let secondDetectStarted!: () => void;
  let hasDetected = false;
  let cameraRequests = 0;
  const detectionStarted = new Promise<void>((resolve) => {
    detectStarted = () => {
      hasDetected = true;
      resolve();
    };
  });
  const detection = new Promise<Array<{ rawValue: string }>>((resolve) => {
    resolveDetection = resolve;
  });
  const secondDetectionStarted = new Promise<void>((resolve) => {
    secondDetectStarted = resolve;
  });
  class MockBarcodeDetector {
    constructor(_options: { formats: string[] }) {}
    static getSupportedFormats() {
      return Promise.resolve(["qr_code"]);
    }
    detect() {
      if (!hasDetected) {
        detectStarted();
        return detection;
      }
      secondDetectStarted();
      return new Promise<Array<{ rawValue: string }>>((_, reject) => {
        rejectSecondDetection = reject;
      });
    }
  }
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: MockBarcodeDetector,
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () => {
        cameraRequests++;
        return Promise.resolve({ getTracks: () => [] } as unknown as MediaStream);
      },
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
    configurable: true,
    get: () => HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(HTMLMediaElement, "HAVE_CURRENT_DATA", {
    configurable: true,
    value: 2,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get: () => null,
    set: () => {},
  });
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal(): void;
    close(): void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };

  const button = document.createElement("button");
  document.body.append(button);
  const spool = makeSpool("spoolio", "A1");
  let opened = false;
  wireCameraScanner(button, {
    read: () => ({ kind: "spool", spool }),
    open: () => {
      opened = true;
    },
  });

  button.click();
  const dialog = document.querySelector("#camera-scan-dialog") as HTMLDialogElement;
  await Promise.race([detectionStarted, new Promise((resolve) => setTimeout(resolve, 100))]);
  expect({
    hasDetected,
    cameraRequests,
    status: dialog.querySelector('[role="status"]')?.textContent,
  }).toEqual({
    hasDetected: true,
    cameraRequests: 1,
    status: "Camera ready. Hold a label steady in view.",
  });
  dialog.close();
  resolveDetection([{ rawValue: "spoolio:A1" }]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(opened).toBe(false);

  button.click();
  await secondDetectionStarted;
  const readyStatus = dialog.querySelector('[role="status"]')?.textContent;
  dialog.close();
  rejectSecondDetection(new Error("old frame failed"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(dialog.querySelector('[role="status"]')?.textContent).toBe(readyStatus);
});
