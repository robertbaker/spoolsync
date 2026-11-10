/**
 * The one finish vocabulary. Services spell a finish differently (Spoolstock's `features` "UV
 * Glow", TigerTag's "Glow", 3DFP's "Matt", Spoolio's free text), so every adapter reads its words
 * into these common spellings and writes them back through the same table. The common finish text
 * is the distinct words, sorted, joined by ", ", so the same finish compares equal whatever order
 * or spelling a service used.
 */

/** Finish words as the common finish spells them, with the other spellings read as the same word. */
const FINISH_WORDS: ReadonlyArray<readonly [word: string, aliases: readonly string[]]> = [
  ["Matte", ["Matt"]],
  ["Silk", []],
  ["Glossy", ["Gloss"]],
  ["Satin", []],
  ["Glitter", []],
  ["Metallic", ["Metal"]],
  ["Marble", []],
  ["Wood", []],
  ["Translucent", []],
  ["Transparent", ["Clear"]],
  ["Glow In the Dark", ["Glow", "UV Glow", "Glow-in-the-dark", "GITD"]],
  ["Carbon Fiber", ["Carbon Fibre", "Carbon"]],
  ["Rainbow", []],
  ["Neon", []],
  ["Pearl", []],
  ["Tricolor", ["Tri Color", "Tricolour", "Tri-Color"]],
  ["Dual Color", ["Bicolor", "Bi Color", "Bicolour", "Dual Colour", "Bi-Color"]],
  ["Fiber", ["Fibre"]],
];

/** Words that mean "no particular finish" in a service's own vocabulary. */
const PLAIN = new Set(["basic", "standard"]);

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const wordByKey = new Map(
  FINISH_WORDS.flatMap(([word, aliases]) =>
    [word, ...aliases].map((label) => [normalize(label), word] as const),
  ),
);

/** Whether a word is the plain "Basic" / "Standard" finish, which is no finish at all. */
export const isPlainFinish = (text: string | null | undefined): boolean =>
  PLAIN.has(normalize(text ?? ""));

/** The common spelling of a known finish word, or undefined for any other text. */
export const finishWord = (text: string | null | undefined): string | undefined =>
  wordByKey.get(normalize(text ?? ""));

/**
 * The distinct finish words of a list or text, in the common spelling and order. Words this table
 * does not know (Multicolor, Gradient) are kept as written, trimmed. Plain words are dropped.
 * `slash` also splits "Matte/Silk", for services that write the words that way. `keepOrder` leaves
 * the words as given, for a service that has room for only the first few.
 */
export function finishWords(
  input: string | readonly unknown[] | null | undefined,
  options: { slash?: boolean; keepOrder?: boolean } = {},
): string[] {
  const labels =
    typeof input === "string"
      ? input.split(options.slash ? /[,;/]/ : /[,;]/)
      : Array.isArray(input)
        ? input.filter((label): label is string => typeof label === "string")
        : [];
  const words = new Map<string, string>();
  for (const label of labels) {
    const text = label.replace(/\s+/g, " ").trim();
    if (!text || isPlainFinish(text)) continue;
    const word = finishWord(text) ?? text;
    if (!words.has(normalize(word))) words.set(normalize(word), word);
  }
  const list = words.values().toArray();
  return options.keepOrder ? list : list.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The common finish text for a service's words; null when there is no finish. */
export function commonFinish(
  input: string | readonly unknown[] | null | undefined,
  options: { slash?: boolean } = {},
): string | null {
  return finishWords(input, options).join(", ") || null;
}
