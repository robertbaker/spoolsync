import { expect, test } from "bun:test";

import { currentTourIndex, TourController } from "./controller";
import { steps } from "./steps";

function fixture(initial: string) {
  let href = initial;
  const events: string[] = [];
  const controller = new TourController(
    steps,
    {
      href: () => href,
      pathname: () => new URL(href).pathname,
      assign: (url) => {
        events.push(`assign:${url}`);
      },
      replace: (url) => {
        events.push(`replace:${url}`);
      },
      update: (url) => {
        href = url.toString();
        events.push(`update:${url.pathname}${url.search}${url.hash}`);
      },
    },
    {
      render: (index) => {
        events.push(`render:${index}`);
      },
      clear: () => {
        events.push("clear");
      },
      focusLauncher: () => {
        events.push("focus");
      },
    },
  );
  return { controller, events, href: () => href };
}

test("tour parsing preserves existing integer-prefix handling and range checks", () => {
  expect(currentTourIndex("https://test/?tour=2suffix", steps.length)).toBe(2);
  for (const query of ["", "?tour=", "?tour=invalid", "?tour=-1", "?tour=6"])
    expect(currentTourIndex(`https://test/${query}`, steps.length)).toBeNull();
});

test("tour startup replaces an incorrect route before rendering", () => {
  const f = fixture("https://test/?tour=1");
  f.controller.start();
  expect(f.events).toEqual(["replace:/connections?tour=1"]);
});

test("tour navigation updates same-page steps and assigns cross-page steps", () => {
  const f = fixture("https://test/sync?tour=3&keep=yes#anchor");
  f.controller.goTo(4);
  f.controller.goTo(2);
  expect(f.events).toEqual([
    "update:/sync?tour=4&keep=yes#anchor",
    "render:4",
    "assign:/load?tour=2",
  ]);
});

test("ending a tour clears the view and query before restoring launcher focus", () => {
  const f = fixture("https://test/sync?tour=5&keep=yes#anchor");
  f.controller.goTo(steps.length);
  expect(f.events).toEqual(["clear", "update:/sync?keep=yes#anchor", "focus"]);
  expect(new URL(f.href()).searchParams.has("tour")).toBe(false);
});
