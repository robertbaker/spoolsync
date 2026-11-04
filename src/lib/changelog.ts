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

/**
 * Only https links are ever turned into links, so a changelog cannot inject a script URL. Links
 * with embedded credentials are refused too, since they read as one site and go to another.
 */
export function safeUrl(url: string | undefined): string | null {
  if (!url || !/^https:\/\/[^\s)]+$/.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}

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

/** Negative when `a` is older than `b`, positive when newer, zero when equal. Numeric per part. */
export function compareVersions(a: string, b: string): number {
  const numbers = (text: string) =>
    text
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [numbers(a), numbers(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** Whether `version` is older than the newest release in the file, i.e. there is an update. */
export function isOlderThanLatest(releases: readonly ChangelogRelease[], version: string): boolean {
  const latest = releases[0]?.version;
  if (!latest || latest === version) return false;
  return compareVersions(version, latest) < 0;
}

/**
 * Releases published after `seen` (the version the visitor last opened the changelog at), newest
 * first. Nothing is "new" for a first visit (`seen` empty), so nobody is told about changes they
 * could not have missed.
 */
export function releasesSince(
  releases: readonly ChangelogRelease[],
  seen: string | null | undefined,
): ChangelogRelease[] {
  if (!seen) return [];
  return releases.filter((release) => compareVersions(release.version, seen) > 0);
}

/** The kinds of change a section can hold; each gets its own icon and color in the dialog. */
export const SECTION_KINDS = [
  "breaking",
  "features",
  "fixes",
  "performance",
  "docs",
  "maintenance",
  "other",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  breaking: "Breaking",
  features: "Features",
  fixes: "Bug fixes",
  performance: "Performance",
  docs: "Documentation",
  maintenance: "Maintenance",
  other: "Other",
};

/** Maps a conventional-changelog section title to a kind; unknown titles are `other`. */
export function sectionKind(title: string): SectionKind {
  const text = title.toLowerCase();
  if (/breaking/.test(text)) return "breaking";
  if (/feature|added|\bnew\b/.test(text)) return "features";
  if (/fix|bug|security/.test(text)) return "fixes";
  if (/perf|speed/.test(text)) return "performance";
  if (/doc/.test(text)) return "docs";
  if (/refactor|build|chore|test|\bci\b|style|revert|maintenance|dependenc/.test(text))
    return "maintenance";
  return "other";
}

export interface ChangelogFilter {
  /** Section kinds to keep; empty keeps all. */
  kinds?: ReadonlySet<SectionKind> | readonly SectionKind[];
  /** Words that must all appear in an item's text, scope, section title or version. */
  query?: string;
}

/**
 * Narrows releases to the sections of the chosen kinds and the items matching every search word.
 * Releases and sections left with nothing are dropped. The input is not modified.
 */
export function filterReleases(
  releases: readonly ChangelogRelease[],
  filter: ChangelogFilter,
): ChangelogRelease[] {
  const kinds = new Set<SectionKind>(filter.kinds ?? []);
  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!kinds.size && !words.length) return [...releases];
  const result: ChangelogRelease[] = [];
  for (const release of releases) {
    const sections: ChangelogSection[] = [];
    for (const section of release.sections) {
      if (kinds.size && !kinds.has(sectionKind(section.title))) continue;
      const items = section.items.filter((item) => {
        if (!words.length) return true;
        const haystack =
          `${item.text} ${item.scope ?? ""} ${section.title} ${release.version}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      });
      if (items.length) sections.push({ title: section.title, items });
    }
    if (sections.length) result.push({ ...release, sections });
  }
  return result;
}

/** How many items a release lists in total. */
export function countItems(release: ChangelogRelease): number {
  return release.sections.reduce((sum, section) => sum + section.items.length, 0);
}

/** The kinds present in the releases, in the fixed display order, for building the filter chips. */
export function presentKinds(releases: readonly ChangelogRelease[]): SectionKind[] {
  const found = new Set(
    releases.flatMap((release) => release.sections.map((section) => sectionKind(section.title))),
  );
  return SECTION_KINDS.filter((kind) => found.has(kind));
}

/** A commit hash shortened for display. */
export const shortHash = (hash: string): string => hash.slice(0, 7);
