/** Text helpers behind the whitespace and casing rules. Pure and locale independent. */

const ZERO_WIDTH = /[​-‍⁠﻿­]/g;
const UNUSUAL_SPACES = /[   -   　]/g;

/**
 * Single-line text: zero-width characters removed, no-break and other unusual spaces turned into a
 * plain space, runs of whitespace (tabs and line breaks included) collapsed, ends trimmed.
 */
export function cleanInline(text: string): string {
  return text.replace(ZERO_WIDTH, "").replace(UNUSUAL_SPACES, " ").replace(/\s+/g, " ").trim();
}

/**
 * Free text such as notes: only invisible characters and unusual spaces are fixed and the ends
 * trimmed. Line breaks and the spacing inside a line are the person's own and stay.
 */
export function cleanMultiline(text: string): string {
  return text.replace(ZERO_WIDTH, "").replace(UNUSUAL_SPACES, " ").trim();
}

/** Letters and digits only, lowercased, accents removed; for "is this only a cosmetic change?". */
export function plainKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Words that stay uppercase in names ("PLA", "CF"). */
export const ACRONYMS: ReadonlySet<string> = new Set([
  "PLA",
  "PETG",
  "PET",
  "PCTG",
  "ABS",
  "ASA",
  "TPU",
  "TPE",
  "PA",
  "PC",
  "PP",
  "PVA",
  "BVOH",
  "HIPS",
  "PEEK",
  "PEI",
  "PBT",
  "POM",
  "CF",
  "GF",
  "UV",
  "LED",
  "RGB",
  "HS",
  "HF",
  "RAL",
  "CMYK",
  "FDM",
  "SLA",
  "UPC",
  "EAN",
]);

/** Brand spellings that are not plain title case. Keys are lowercase. */
export const BRAND_CASING: ReadonlyMap<string, string> = new Map([
  ["esun", "eSUN"],
  ["colorfabb", "colorFabb"],
  ["3djake", "3DJake"],
  ["polymaker", "Polymaker"],
  ["prusament", "Prusament"],
  ["elegoo", "Elegoo"],
  ["sunlu", "Sunlu"],
  ["hatchbox", "Hatchbox"],
  ["overture", "Overture"],
  ["eryone", "Eryone"],
  ["creality", "Creality"],
  ["anycubic", "Anycubic"],
  ["fiberlogy", "Fiberlogy"],
  ["fillamentum", "Fillamentum"],
  ["extrudr", "extrudr"],
  ["matterhackers", "MatterHackers"],
  ["ninjatek", "NinjaTek"],
  ["protopasta", "Proto-pasta"],
  ["tinmorry", "Tinmorry"],
]);

const SMALL_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "de",
  "del",
  "der",
  "des",
  "du",
  "for",
  "in",
  "la",
  "le",
  "of",
  "on",
  "or",
  "the",
  "to",
  "van",
  "von",
  "with",
]);

/** Splits into words and the separators between them, keeping both. */
const TOKENS = /(\s+|[-/(),:;&])/;

/** Letters only, so "all caps" and "all lowercase" ignore digits and punctuation. */
const lettersOf = (text: string) => text.replace(/[^\p{L}]/gu, "");

/** Whether a text is entirely one case, the only texts the casing rule rewrites. */
export function caseShape(text: string): "lower" | "upper" | "mixed" | "none" {
  const letters = lettersOf(text);
  if (letters.length < 2) return "none";
  if (letters === letters.toLowerCase()) return "lower";
  if (letters === letters.toUpperCase()) return "upper";
  return "mixed";
}

function capitalize(word: string): string {
  const chars = [...word];
  return chars.length ? chars[0]!.toUpperCase() + chars.slice(1).join("").toLowerCase() : word;
}

/** True for an unknown short word in an all-caps text, which may be an acronym. */
function maybeAcronym(word: string): boolean {
  const core = lettersOf(word);
  return (
    core.length >= 2 &&
    core.length <= 3 &&
    !SMALL_WORDS.has(core.toLowerCase()) &&
    !ACRONYMS.has(core.toUpperCase()) &&
    !BRAND_CASING.has(core.toLowerCase())
  );
}

function titleWord(word: string, first: boolean): string {
  const lower = word.toLowerCase();
  const plus = lower.endsWith("+") ? "+" : "";
  const core = plus ? lower.slice(0, -1) : lower;
  const brand = BRAND_CASING.get(core);
  if (brand) return brand + plus;
  if (ACRONYMS.has(core.toUpperCase())) return core.toUpperCase() + plus;
  // Shore hardness ("95a") and "3d" are written with an uppercase letter.
  if (/^\d{2,3}[ad]$/.test(core) || core === "3d") return core.toUpperCase() + plus;
  if (/^\d/.test(core)) return core + plus;
  if (!first && SMALL_WORDS.has(core)) return core + plus;
  return capitalize(core) + plus;
}

/**
 * Title case with exceptions for brands ("eSUN"), material acronyms ("PLA+", "PETG-CF") and
 * hardness ("95A"). Only meant for text that is entirely one case; mixed-case text is left alone
 * by the caller because people write "PolyMaker" and "ColorFabb" on purpose.
 */
export function titleCase(text: string): string {
  let first = true;
  return text
    .split(TOKENS)
    .map((part) => {
      if (!part || TOKENS.test(part)) return part;
      const result = titleWord(part, first);
      first = false;
      return result;
    })
    .join("");
}

/**
 * The title-cased text, or `null` when casing should not change it. `uncertain` is set when an
 * all-caps text holds short unknown words that might be acronyms; those are kept uppercase.
 */
export function recase(text: string): { text: string; uncertain: boolean } | null {
  const shape = caseShape(text);
  if (shape !== "lower" && shape !== "upper") return null;
  let uncertain = false;
  let result = titleCase(text);
  if (shape === "upper") {
    const originals = text.split(TOKENS);
    result = result
      .split(TOKENS)
      .map((part, position) => {
        const original = originals[position] ?? part;
        if (original && !TOKENS.test(original) && maybeAcronym(original)) {
          uncertain = true;
          return original;
        }
        return part;
      })
      .join("");
  }
  return result === text ? null : { text: result, uncertain };
}
