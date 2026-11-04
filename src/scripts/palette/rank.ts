/** What the palette needs to know about an entry in order to rank it. */
export interface Rankable {
  id: string;
  title: string;
  subtitle?: string | undefined;
  /** Extra words that should find the entry but are not shown. */
  keywords?: string | undefined;
  /**
   * Other names people use for the same action ("dark mode" for the theme toggle). They find the
   * entry like keywords do, and a match counts as much as one in the title.
   */
  aliases?: readonly string[] | undefined;
}

/** Lower case, accents removed, so "Prusament" and "prúsament" match each other. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const isWordStart = (text: string, index: number) =>
  index === 0 || /[^a-z0-9]/.test(text[index - 1]!);

/** Score for one query word against text that is already normalized; null when it does not occur. */
function tokenScore(token: string, text: string): number | null {
  const at = text.indexOf(token);
  if (at !== -1) {
    // Whole-word and prefix hits beat a match in the middle of a word.
    return 100 + (isWordStart(text, at) ? 60 : 0) + (at === 0 ? 40 : 0) - Math.min(at, 30);
  }
  // Otherwise the letters must appear in order ("pla" finds "Polymaker Lite Aqua").
  let score = 10;
  let position = 0;
  let previous = -2;
  for (const character of token) {
    const found = text.indexOf(character, position);
    if (found === -1) return null;
    if (found === previous + 1) score += 8;
    else score -= Math.min(found - position, 6);
    if (isWordStart(text, found)) score += 10;
    previous = found;
    position = found + 1;
  }
  return Math.max(score, 1);
}

/**
 * How well a query matches some text: every space-separated word must match, either as a substring
 * (best) or as letters in order. Null means no match; higher is better.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const haystack = normalize(text);
  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(token, haystack);
    if (score === null) return null;
    total += score;
  }
  return total;
}

/**
 * Entries that match the query, best first. A title match counts double, so typing "sync" puts the
 * Sync page ahead of an action that merely mentions it. Equal scores keep their original order,
 * which keeps the list stable while typing. An empty query returns the entries unchanged.
 */
export function rankItems<T extends Rankable>(
  items: readonly T[],
  query: string,
  limit = Infinity,
): T[] {
  if (!normalize(query).trim()) return items.slice(0, limit);
  const scored: Array<{ item: T; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const everything = [item.title, item.subtitle, item.keywords, ...(item.aliases ?? [])]
      .filter(Boolean)
      .join(" ");
    const overall = fuzzyScore(query, everything);
    if (overall === null) return;
    // An alias is another title for the entry, so the best of them earns the title bonus.
    const named = [item.title, ...(item.aliases ?? [])].map((name) => fuzzyScore(query, name));
    const inTitle = Math.max(0, ...named.map((score) => score ?? 0));
    scored.push({ item, score: overall + inTitle * 2, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ item }) => item);
}

/** Moves recently chosen entries to the front, in the order they were chosen, keeping the rest. */
export function withRecents<T extends { id: string }>(
  items: readonly T[],
  recentIds: readonly string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const recent = recentIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const chosen = new Set(recent.map((item) => item.id));
  return [...recent, ...items.filter((item) => !chosen.has(item.id))];
}

/** Records a choice at the front of a short most-recent-first list without duplicates. */
export function pushRecent(recentIds: readonly string[], id: string, max = 5): string[] {
  return [id, ...recentIds.filter((existing) => existing !== id)].slice(0, max);
}

/**
 * The visible list for a query: commands ranked first, then a few matching spools. With no query,
 * recently chosen commands come first and spools are left out, since there is nothing to match.
 */
export function resultsFor<T extends Rankable>(
  query: string,
  commands: readonly T[],
  spools: readonly T[],
  recents: readonly string[],
  limits = { commands: 30, spools: 8 },
): T[] {
  if (!normalize(query).trim()) return withRecents(commands, recents).slice(0, limits.commands);
  return [
    ...rankItems(commands, query, limits.commands),
    ...rankItems(spools, query, limits.spools),
  ];
}
