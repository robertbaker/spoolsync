import { expect, test } from "bun:test";

import { SOURCE_IDS } from "@spoolsync/core/core/model";

import { readLoadResult } from "~/lib/browser/storage";

async function settle(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Inventory UI did not settle");
}

test("file imports preserve valid data, ignore superseded reads, and respect unload", async () => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.replaceChildren();
  for (const source of SOURCE_IDS) {
    for (const suffix of ["status", "message", "drop", "target", "cloud-hint"]) {
      const element = document.createElement("div");
      element.id = `${source}-${suffix}`;
      document.body.append(element);
    }
    for (const suffix of ["file", "url", "key", "token"]) {
      const input = document.createElement("input");
      input.id = `${source}-${suffix}`;
      document.body.append(input);
    }
    for (const suffix of ["load", "cloud", "fetch"]) {
      const button = document.createElement("button");
      button.id = `${source}-${suffix}`;
      document.body.append(button);
    }
  }
  for (const id of ["loaded-table", "loaded-summary"]) {
    const element = document.createElement("div");
    element.id = id;
    document.body.append(element);
  }
  await import("./load");
  const input = document.getElementById("spoolio-file") as HTMLInputElement;
  const message = document.getElementById("spoolio-message")!;
  const status = document.getElementById("spoolio-status")!;
  const inventory = (id: string) => JSON.stringify({ version: 1, filaments: [{ id, brand: id }] });
  const choose = (name: string, text: () => Promise<string>) => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ name, size: 100, text }],
    });
    input.dispatchEvent(new Event("change"));
  };
  const originalFetch = globalThis.fetch;
  try {
    choose("valid.json", async () => inventory("original"));
    await settle(() => readLoadResult("spoolio")?.spools[0]?.sourceId === "original");
    choose("broken.json", async () => "{broken");
    await settle(() => message.textContent?.includes("No spools found") ?? false);
    expect(readLoadResult("spoolio")?.spools[0]?.sourceId).toBe("original");
    expect(status.textContent).toContain("1 loaded");
    expect(message.textContent).toContain("previously loaded inventory");

    let finishOld!: (text: string) => void;
    choose(
      "slow.json",
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    choose("new.json", async () => inventory("new"));
    await settle(() => readLoadResult("spoolio")?.spools[0]?.sourceId === "new");
    finishOld(inventory("old"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(readLoadResult("spoolio")?.spools[0]?.sourceId).toBe("new");
    expect(message.textContent).toContain("new.json");

    let finishUnloaded!: (text: string) => void;
    choose(
      "pending.json",
      () =>
        new Promise((resolve) => {
          finishUnloaded = resolve;
        }),
    );
    status.querySelector("button")!.click();
    finishUnloaded(inventory("resurrected"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(readLoadResult("spoolio")).toBeNull();
    expect(status.textContent).toContain("Not loaded");

    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify([{ id: 7, material: "PLA", cost_per_kg: 20 }]), {
          headers: { "Content-Type": "application/json" },
        }),
      { preconnect: originalFetch.preconnect },
    );
    const urlInput = document.getElementById("bambuddy-url") as HTMLInputElement;
    const keyInput = document.getElementById("bambuddy-key") as HTMLInputElement;
    urlInput.value = "https://bambuddy.example";
    keyInput.value = "test-key";
    keyInput.dispatchEvent(new Event("input"));
    (document.getElementById("bambuddy-fetch") as HTMLButtonElement).click();
    await settle(() => readLoadResult("bambuddy")?.spools[0]?.sourceId === "7");
    expect(document.getElementById("bambuddy-message")?.textContent).toContain(
      "price per spool is unknown",
    );

    // A pending API response must not replace a newer file or undo an unload.
    const apiButton = document.getElementById("bambuddy-fetch") as HTMLButtonElement;
    const apiMessage = document.getElementById("bambuddy-message")!;
    const apiInput = document.getElementById("bambuddy-file") as HTMLInputElement;
    for (const outcome of ["replace", "unload", "error"] as const) {
      let finish!: (response: Response) => void;
      globalThis.fetch = Object.assign(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
        { preconnect: originalFetch.preconnect },
      );
      await settle(() => !apiButton.disabled);
      apiButton.click();
      await settle(() => typeof finish === "function");
      Object.defineProperty(apiInput, "files", {
        configurable: true,
        value: [
          { name: "newer.json", size: 100, text: async () => '[{"id":8,"material":"PETG"}]' },
        ],
      });
      apiInput.dispatchEvent(new Event("change"));
      await settle(() => readLoadResult("bambuddy")?.spools[0]?.sourceId === "8");
      if (outcome === "unload") {
        document.getElementById("bambuddy-status")!.querySelector("button")!.click();
      }
      finish(
        outcome === "error"
          ? new Response("failed", { status: 500 })
          : new Response('[{"id":9,"material":"PLA"}]', {
              headers: { "Content-Type": "application/json" },
            }),
      );
      await settle(() => !apiButton.disabled);
      if (outcome === "unload") {
        expect(readLoadResult("bambuddy")).toBeNull();
        expect(apiMessage.textContent).toBe("");
      } else {
        expect(readLoadResult("bambuddy")?.spools[0]?.sourceId).toBe("8");
        expect(apiMessage.textContent).toContain("newer.json");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    localStorage.clear();
    sessionStorage.clear();
  }
});
