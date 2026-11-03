import { expect, mock, test } from "bun:test";

import { copyText } from "./clipboard";

test("uses the async clipboard when it works", async () => {
  const writeText = mock(async (_text: string) => {});
  const legacyCopy = mock((_text: string) => true);
  expect(await copyText("hi", { writeText, legacyCopy })).toBe(true);
  expect(writeText).toHaveBeenCalledWith("hi");
  expect(legacyCopy).not.toHaveBeenCalled();
});

test("falls back when the async clipboard is refused or missing", async () => {
  const legacyCopy = mock((_text: string) => true);
  const refused = async () => {
    throw new Error("denied");
  };
  expect(await copyText("hi", { writeText: refused, legacyCopy })).toBe(true);
  expect(await copyText("again", { legacyCopy })).toBe(true);
  expect(legacyCopy).toHaveBeenCalledTimes(2);
});

test("reports failure when every path fails", async () => {
  expect(await copyText("x", {})).toBe(false);
  expect(
    await copyText("x", {
      legacyCopy: () => {
        throw new Error("no");
      },
    }),
  ).toBe(false);
});
