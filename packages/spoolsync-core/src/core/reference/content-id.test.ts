import { expect, test } from "bun:test";

import { contentId } from "./content-id";

test("content id parts cannot collide through separator characters", () => {
  expect(contentId(["acme|custom", "PLA"])).not.toBe(contentId(["acme", "custom|PLA"]));
  expect(contentId(["acme%7Ccustom", "PLA"])).not.toBe(contentId(["acme|custom", "PLA"]));
});
