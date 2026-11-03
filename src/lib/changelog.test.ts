import { expect, test } from "bun:test";

import { findRelease, isOlderThanLatest, parseChangelog } from "./changelog";

const sample = `# Changelog

## [0.3.0](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.2.0...spoolsync-cli-v0.3.0) (2026-11-03)

### Features

* add SpoolMaster, Spool Hoarder sources ([351dac8](https://github.com/robertbaker/spoolsync/commit/351dac8a80e9ae9f7edc8163d7058a31c89cb710))
* **cli:** add --export-csv to write one CSV ([349f59e](https://github.com/robertbaker/spoolsync/commit/349f59e3d234b60cae181b24b4ee6c542102af41))

### Bug Fixes

* **a11y:** move Unload out of panel summaries ([780c165](https://github.com/robertbaker/spoolsync/commit/780c165a1))

## [0.2.0](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.1.2...spoolsync-cli-v0.2.0) (2026-10-28)

### Bug Fixes

* **sync:** retain completed write logs across apply failures ([3aa6df2](https://github.com/robertbaker/spoolsync/commit/3aa6df2bb5c7a9202515f61798aaf530b554f30f))
`;

test("reads releases, sections, scopes, and commit links in order", () => {
  const releases = parseChangelog(sample);
  expect(releases.map((release) => release.version)).toEqual(["0.3.0", "0.2.0"]);
  const latest = releases[0]!;
  expect(latest).toMatchObject({ date: "2026-11-03" });
  expect(latest.url).toContain("compare/spoolsync-cli-v0.2.0...spoolsync-cli-v0.3.0");
  expect(latest.sections.map((section) => section.title)).toEqual(["Features", "Bug Fixes"]);
  expect(latest.sections[0]!.items[0]).toEqual({
    scope: null,
    text: "add SpoolMaster, Spool Hoarder sources",
    commits: [
      {
        hash: "351dac8",
        url: "https://github.com/robertbaker/spoolsync/commit/351dac8a80e9ae9f7edc8163d7058a31c89cb710",
      },
    ],
  });
  expect(latest.sections[0]!.items[1]).toMatchObject({
    scope: "cli",
    text: "add --export-csv to write one CSV",
  });
  expect(latest.sections[1]!.items[0]).toMatchObject({ scope: "a11y" });
});

test("only https links are kept, so a changelog cannot inject a script URL", () => {
  const [release] = parseChangelog(
    "## [1.0.0](javascript:void) (2026-01-01)\n\n### Features\n\n* thing ([abcdef1](data:text/html,x))\n",
  );
  expect(release!.url).toBeNull();
  expect(release!.sections[0]!.items[0]!.commits).toEqual([{ hash: "abcdef1", url: null }]);
});

test("plain version headings, odd lines, and empty input are handled", () => {
  expect(parseChangelog("")).toEqual([]);
  expect(parseChangelog("# Changelog\n\nnothing here\n")).toEqual([]);
  const releases = parseChangelog(
    "## 1.2.3 (2026-02-02)\n\n### Features\n\n* plain item\n\nstray text\n## not a version heading with spaces\n",
  );
  expect(releases).toHaveLength(1);
  expect(releases[0]).toMatchObject({ version: "1.2.3", date: "2026-02-02", url: null });
  expect(releases[0]!.sections[0]!.items).toEqual([
    { scope: null, text: "plain item", commits: [] },
  ]);
});

test("finds a release and tells whether the running version is behind", () => {
  const releases = parseChangelog(sample);
  expect(findRelease(releases, "0.2.0")?.date).toBe("2026-10-28");
  expect(findRelease(releases, "9.9.9")).toBeUndefined();
  expect(isOlderThanLatest(releases, "0.2.0")).toBe(true);
  expect(isOlderThanLatest(releases, "0.3.0")).toBe(false);
  expect(isOlderThanLatest(releases, "0.10.0")).toBe(false);
  expect(isOlderThanLatest([], "0.1.0")).toBe(false);
});
