import { beforeEach, expect, test } from "bun:test";

import { MAX_TARE_GRAMS, WEIGH_IN_KEY, forgetTare, readTares, saveTare } from "./weigh-in";

beforeEach(() => localStorage.clear());

test("saves, reads and forgets a tare per brand, rejecting impossible values", () => {
  expect(saveTare("Bambu Lab", 252.46)).toBe(true);
  expect(saveTare("Hatchbox", 0)).toBe(false);
  expect(saveTare("Hatchbox", 0.04)).toBe(false);
  expect(saveTare("Hatchbox", MAX_TARE_GRAMS + 1)).toBe(false);
  expect(saveTare("Hatchbox", Number.NaN)).toBe(false);
  expect(readTares()).toEqual({ bambulab: 252.5 });
  expect(forgetTare("bambu lab")).toBe(true);
  expect(localStorage.getItem(WEIGH_IN_KEY)).toBeNull();
});

test("saving a tare when the list is full keeps the new value and drops the oldest", () => {
  const full = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [`brand${index}x`, 200]),
  );
  localStorage.setItem(WEIGH_IN_KEY, JSON.stringify({ tares: full }));
  expect(saveTare("Newcomer", 180)).toBe(true);
  const tares = readTares();
  expect(tares["newcomer"]).toBe(180);
  expect(Object.keys(tares)).toHaveLength(100);
  expect(tares["brand0x"]).toBeUndefined();
  expect(tares["brand99x"]).toBe(200);
  expect(saveTare("brand50x", 210)).toBe(true);
  expect(readTares()["brand50x"]).toBe(210);
  expect(readTares()["brand1x"]).toBe(200);
});

test("damaged storage reads as nothing", () => {
  localStorage.setItem(WEIGH_IN_KEY, "{not json");
  expect(readTares()).toEqual({});
});
