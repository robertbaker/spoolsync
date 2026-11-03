/** Where the footer's changelog modal reads from. The release tool writes this file. */
export const CHANGELOG_URL =
  "https://raw.githubusercontent.com/robertbaker/spoolsync/main/packages/spoolsync-cli/CHANGELOG.md";
export const CHANGELOG_PAGE_URL =
  "https://github.com/robertbaker/spoolsync/blob/main/packages/spoolsync-cli/CHANGELOG.md";

export interface ChangelogCommit {
  hash: string;
  url: string | null;
}

export interface ChangelogItem {
  scope: string | null;
  text: string;
  commits: ChangelogCommit[];
}

export interface ChangelogSection {
  /** Such as "Features" or "Bug Fixes". */
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogRelease {
  version: string;
  /** The compare link for the release, when the file has one. */
  url: string | null;
  date: string | null;
  sections: ChangelogSection[];
}

/** Only https links are ever turned into links, so a changelog cannot inject a script URL. */
const safeUrl = (url: string | undefined): string | null =>
  url && /^https:\/\/[^\s)]+$/.test(url) ? url : null;

const RELEASE_HEADING =
  /^##\s+(?:\[([^\]]+)\]\(([^)]*)\)|\[?([^\s\]]+)\]?)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/;
const COMMIT_LINK = /\(\[([0-9a-f]{7,40})\]\(([^)]*)\)\)/g;

function parseItem(line: string): ChangelogItem {
  let body = line.replace(/^[*-]\s+/, "");
  const commits: ChangelogCommit[] = [];
  body = body.replace(COMMIT_LINK, (_match, hash: string, url: string) => {
    commits.push({ hash, url: safeUrl(url) });
    return "";
  });
  const scoped = /^\*\*([^*]+):\*\*\s*(.*)$/.exec(body.trim());
  return {
    scope: scoped ? scoped[1]!.trim() : null,
    text: (scoped ? scoped[2]! : body).trim(),
    commits,
  };
}

/**
 * Reads the conventional-changelog Markdown the release tool writes: `## [version](compare-url)
 * (date)` headings, `### Section` groups, and `* **scope:** summary ([hash](url))` bullets.
 * Anything it does not recognise is skipped rather than guessed at.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | undefined;
  let section: ChangelogSection | undefined;
  for (const raw of markdown.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      const match = RELEASE_HEADING.exec(line);
      const version = match ? (match[1] ?? match[3]) : undefined;
      if (!match || !version) {
        release = undefined;
        section = undefined;
        continue;
      }
      release = { version, url: safeUrl(match[2]), date: match[4] ?? null, sections: [] };
      releases.push(release);
      section = undefined;
    } else if (release && line.startsWith("### ")) {
      section = { title: line.slice(4).trim(), items: [] };
      release.sections.push(section);
    } else if (release && section && /^[*-]\s+/.test(line)) {
      section.items.push(parseItem(line));
    }
  }
  return releases;
}

/** The release for a version, if the file lists it (an unreleased build will not be there). */
export function findRelease(
  releases: readonly ChangelogRelease[],
  version: string,
): ChangelogRelease | undefined {
  return releases.find((release) => release.version === version);
}

/** Whether `version` is older than the newest release in the file, i.e. there is an update. */
export function isOlderThanLatest(releases: readonly ChangelogRelease[], version: string): boolean {
  const latest = releases[0]?.version;
  if (!latest || latest === version) return false;
  const numbers = (text: string) =>
    text.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [numbers(version), numbers(latest)];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference < 0;
  }
  return false;
}
