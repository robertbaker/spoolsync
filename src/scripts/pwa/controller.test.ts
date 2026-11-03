import { expect, test } from "bun:test";

import { PwaController, type InstallPromptEvent, type PwaView } from "./controller";

function setup(installed = false) {
  const log: string[] = [];
  const view: PwaView = {
    showInstall: (visible) => log.push(`install:${visible}`),
    showOffline: (offline) => log.push(`offline:${offline}`),
    showUpdate: (visible) => log.push(`update:${visible}`),
  };
  return { log, controller: new PwaController(view, () => installed) };
}

function promptEvent(outcome: "accepted" | "dismissed") {
  const calls = { prevented: false, prompted: 0 };
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: async () => {
      calls.prompted++;
    },
    userChoice: Promise.resolve({ outcome }),
  }) as InstallPromptEvent;
  const original = event.preventDefault.bind(event);
  event.preventDefault = () => {
    calls.prevented = true;
    original();
  };
  return { event, calls };
}

test("the install button appears when the browser offers it and prompts only once", async () => {
  const { controller, log } = setup();
  expect(await controller.install()).toBe("unavailable");
  const { event, calls } = promptEvent("accepted");
  controller.beforeInstallPrompt(event);
  expect(calls.prevented).toBe(true);
  expect(log).toEqual(["install:true"]);
  expect(await controller.install()).toBe("accepted");
  expect(calls.prompted).toBe(1);
  expect(log).toEqual(["install:true", "install:false"]);
  // The event is spent; a second click has nothing to show.
  expect(await controller.install()).toBe("unavailable");
});

test("a dismissed prompt is reported, and an installed app never shows the button", async () => {
  const dismissed = setup();
  dismissed.controller.beforeInstallPrompt(promptEvent("dismissed").event);
  expect(await dismissed.controller.install()).toBe("dismissed");

  const standalone = setup(true);
  standalone.controller.beforeInstallPrompt(promptEvent("accepted").event);
  expect(standalone.log).toEqual(["install:false"]);

  const later = setup();
  later.controller.beforeInstallPrompt(promptEvent("accepted").event);
  later.controller.installed();
  expect(later.log).toEqual(["install:true", "install:false"]);
  expect(later.controller.install()).resolves.toBe("unavailable");
});

test("going offline and back updates the indicator", () => {
  const { controller, log } = setup();
  controller.setOnline(false);
  controller.setOnline(true);
  expect(log).toEqual(["offline:true", "offline:false"]);
});

test("an update waits for the visitor, then asks the worker to take over", () => {
  const { controller, log } = setup();
  expect(controller.applyUpdate()).toBe(false);
  const sent: unknown[] = [];
  controller.updateWaiting({ postMessage: (message) => sent.push(message) });
  expect(log).toEqual(["update:true"]);
  expect(controller.applying).toBe(false);
  expect(controller.applyUpdate()).toBe(true);
  expect(sent).toEqual([{ type: "SKIP_WAITING" }]);
  expect(controller.applying).toBe(true);
  expect(log).toEqual(["update:true", "update:false"]);
});
