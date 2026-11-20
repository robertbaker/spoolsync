import { afterEach, expect, test } from "bun:test";

import { confirmDialog } from "./confirm-dialog";

afterEach(() => {
  document.body.replaceChildren();
});

// Not every test DOM implements modal dialogs, so give a plain one just enough behaviour.
function polyfillDialog(): void {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

function open(tone?: "danger") {
  polyfillDialog();
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const answer = confirmDialog({
    title: "Write 2 changes?",
    body: "Details",
    confirmLabel: "Write changes",
    ...(tone ? { tone } : {}),
  });
  const dialog = document.querySelector("dialog")!;
  return { opener, answer, dialog };
}

test("it names the question, focuses Cancel and resolves true on confirm", async () => {
  const { answer, dialog } = open();
  expect(dialog.querySelector("h2")?.textContent).toBe("Write 2 changes?");
  expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h2")!.id);
  expect(document.activeElement?.textContent).toBe("Cancel");
  (dialog.querySelector("[data-confirm-accept]") as HTMLElement).click();
  expect(await answer).toBe(true);
  expect(document.querySelector("dialog")).toBeNull();
});

test("cancel and a backdrop click resolve false and return focus to the opener", async () => {
  const first = open();
  (first.dialog.querySelector("[data-confirm-cancel]") as HTMLElement).click();
  expect(await first.answer).toBe(false);
  expect(document.activeElement).toBe(first.opener);

  const second = open();
  second.dialog.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 100,
      right: 400,
      bottom: 300,
      width: 300,
      height: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  // Dragging from inside the dialog to the backdrop must not dismiss.
  second.dialog.dispatchEvent(new PointerEvent("pointerdown", { clientX: 150, clientY: 150 }));
  second.dialog.dispatchEvent(new PointerEvent("pointerup", { clientX: 10, clientY: 10 }));
  expect(second.dialog.hasAttribute("open")).toBe(true);

  // Pressing and releasing outside the dialog dismisses it.
  second.dialog.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
  second.dialog.dispatchEvent(new PointerEvent("pointerup", { clientX: 10, clientY: 10 }));
  expect(await second.answer).toBe(false);
});

test("a danger dialog styles the confirm button as destructive", () => {
  const { dialog } = open("danger");
  expect(dialog.querySelector("[data-confirm-accept]")?.className).toContain("bg-error");
});
