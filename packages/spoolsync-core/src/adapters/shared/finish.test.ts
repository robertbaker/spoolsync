import { describe, expect, test } from "bun:test";

import { commonFinish, finishWord, finishWords, isPlainFinish } from "./finish";

describe("common finish vocabulary", () => {
  test("spellings of one word read as the same common word", () => {
    expect(finishWord("matt")).toBe("Matte");
    expect(finishWord("UV Glow")).toBe("Glow In the Dark");
    expect(finishWord("Carbon  Fibre")).toBe("Carbon Fiber");
    expect(finishWord("Multicolor")).toBeUndefined();
  });

  test("words are distinct, sorted and joined; plain words and blanks are no finish", () => {
    expect(commonFinish(["Silk ", "Matt", "Silk"])).toBe("Matte, Silk");
    expect(commonFinish("Silk; matte, Basic")).toBe("Matte, Silk");
    expect(commonFinish(["Standard"])).toBeNull();
    expect(commonFinish("")).toBeNull();
    expect(commonFinish(null)).toBeNull();
    expect(isPlainFinish(" Basic ")).toBe(true);
  });

  test("slash splitting and order are opt-in", () => {
    expect(finishWords("Gradient/Multicolor")).toEqual(["Gradient/Multicolor"]);
    expect(finishWords("Silk/Matt", { slash: true, keepOrder: true })).toEqual(["Silk", "Matte"]);
  });
});
