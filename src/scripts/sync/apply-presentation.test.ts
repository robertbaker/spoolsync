import { expect, test } from "bun:test";

import { renderReloadRequired } from "./apply-presentation";

test("a stale API target keeps partial-write details visible with reload guidance", () => {
  const notice = renderReloadRequired("spoolman", [
    { groupId: "one", ok: true, message: "Updated spool one" },
    { groupId: "two", ok: false, message: "Failed to update spool two" },
    {
      groupId: "",
      ok: false,
      message: "Spoolman apply finished, but inventory refresh failed: offline.",
    },
  ]);

  expect(notice.textContent).toContain("Spoolman needs to be loaded again");
  expect(notice.textContent).toContain("Some changes may have been written");
  expect(notice.textContent).toContain("Updated spool one");
  expect(notice.textContent).toContain("Failed to update spool two");
  expect(notice.textContent).toContain("refresh failed: offline");
});
