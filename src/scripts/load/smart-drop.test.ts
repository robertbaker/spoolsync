import { expect, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";

import { wireSmartDrop } from "./smart-drop";
import { LoadState } from "./state";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("two ambiguous files cannot claim the same service in one drop", async () => {
  document.body.replaceChildren();
  for (const id of [
    "smart-file",
    "smart-drop",
    "smart-message",
    "threeDfp-message",
    "bambuddy-message",
  ]) {
    const element = document.createElement(id === "smart-file" ? "input" : "div");
    element.id = id;
    document.body.append(element);
  }
  const state = new LoadState({
    readLoadResult: () => null,
    saveLoadResult: () => true,
    clearLoadResult: () => {},
  });
  const context = { state, store: (result: LoadResult) => void state.store(result) };
  wireSmartDrop(context);

  const file = (name: string, spoolName: string) => {
    const text = `vendor,material,name\nAcme,PLA,${spoolName}\n`;
    return {
      name,
      size: text.length,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
      text: async () => text,
    } as unknown as File;
  };
  Object.defineProperty(document.getElementById("smart-file")!, "files", {
    configurable: true,
    value: [file("first.csv", "First"), file("second.csv", "Second")],
  });
  document.getElementById("smart-file")!.dispatchEvent(new Event("change"));

  for (let attempt = 0; attempt < 100; attempt++) {
    if (document.querySelectorAll("#smart-message li button").length === 4) break;
    await flush();
  }
  const choices = [...document.querySelectorAll<HTMLButtonElement>("#smart-message li button")];
  expect(choices).toHaveLength(4);
  choices[0]!.click();
  choices[2]!.click();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (state.results.has("threeDfp")) break;
    await flush();
  }

  expect(state.results.get("threeDfp")?.spools[0]?.name).toBe("First");
  expect(document.querySelector("#smart-message")?.textContent).toContain("already filled");
  document.body.replaceChildren();
});
