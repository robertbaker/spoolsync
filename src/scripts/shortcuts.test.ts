import { expect, test } from "bun:test";

import { isTypingTarget, wireEscapeClear, wireSlashFocus } from "./shortcuts";

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
}

test("typing targets are text fields, not buttons or checkboxes", () => {
  const field = (type: string) => Object.assign(document.createElement("input"), { type });
  expect(isTypingTarget(field("text"))).toBe(true);
  expect(isTypingTarget(field("search"))).toBe(true);
  expect(isTypingTarget(field("checkbox"))).toBe(false);
  expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  expect(isTypingTarget(document.createElement("button"))).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});

test("typing targets include every editable control a global shortcut must leave alone", () => {
  const contentEditable = document.createElement("div");
  contentEditable.contentEditable = "true";
  expect(isTypingTarget(document.createElement("select"))).toBe(true);
  expect(isTypingTarget(contentEditable)).toBe(true);
});

test("slash focuses the field unless typing, using a modifier, or disabled", () => {
  document.body.replaceChildren();
  const input = document.createElement("input");
  input.type = "search";
  document.body.append(input);
  let enabled = true;
  wireSlashFocus(input, () => enabled);

  expect(press("a").defaultPrevented).toBe(false);
  expect(press("/", { ctrlKey: true }).defaultPrevented).toBe(false);
  enabled = false;
  expect(press("/").defaultPrevented).toBe(false);
  enabled = true;
  // happy-dom has no layout, so offsetParent is null; the helper treats that as hidden.
  Object.defineProperty(input, "offsetParent", { value: document.body });
  expect(press("/").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(input);
  // Typing a slash inside the field must not be swallowed.
  expect(press("/").defaultPrevented).toBe(false);
});

test("a missing field is ignored", () => {
  expect(() => wireSlashFocus(null)).not.toThrow();
  expect(() => wireEscapeClear(null)).not.toThrow();
});

test("escape clears a non-empty search input and notifies listeners", () => {
  document.body.replaceChildren();
  const input = document.createElement("input");
  input.type = "search";
  input.value = "pla";
  document.body.append(input);
  let inputs = 0;
  input.addEventListener("input", () => {
    inputs++;
  });
  wireEscapeClear(input);

  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(input.value).toBe("");
  expect(inputs).toBe(1);

  const emptyEvent = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(emptyEvent);
  expect(emptyEvent.defaultPrevented).toBe(false);
});
