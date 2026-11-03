import { expect, test } from "bun:test";

import { isLinkActive, isNavItemActive } from "./navActive";

test("a link is active on its own path and below it, but never on the home link's children", () => {
  expect(isLinkActive("/load", "/load")).toBe(true);
  expect(isLinkActive("/resources", "/resources/some-post")).toBe(true);
  expect(isLinkActive("/", "/load")).toBe(false);
  expect(isLinkActive("https://example.com", "/load")).toBe(false);
});

test("an entry that spans two pages is active on both", () => {
  const inventory = { href: "/load", matchPaths: ["/load", "/sync", "/inventory"] };
  expect(isNavItemActive(inventory, "/load")).toBe(true);
  expect(isNavItemActive(inventory, "/sync")).toBe(true);
  expect(isNavItemActive(inventory, "/sync/")).toBe(true);
  expect(isNavItemActive(inventory, "/cli")).toBe(false);
  expect(isNavItemActive({ href: "/cli" }, "/sync")).toBe(false);
});
