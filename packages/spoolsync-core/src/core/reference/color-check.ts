import { colorFamily, deltaE2000, type ColorFamily } from "../color";
import { normalizeHex } from "../cleanup/numbers";
import type { ColorCheck, ColorVerdict, NameHexCheck } from "./types";

/** CIEDE2000 at or under this is a match: the difference is at most just noticeable. */
export const DELTA_E_MATCH = 2.3;
/** Over `DELTA_E_MATCH` and at or under this the colors are close but a person can tell. */
export const DELTA_E_CLOSE = 5;

export function classifyDeltaE(deltaE: number): ColorVerdict {
  if (!Number.isFinite(deltaE)) return "mismatch";
  if (deltaE <= DELTA_E_MATCH) return "match";
  return deltaE <= DELTA_E_CLOSE ? "close" : "mismatch";
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const cleanHex = (hex: string): string | null => normalizeHex(hex)?.hex ?? null;

/**
 * Compares a spool's colors with a reference's. With equal counts every pair is compared in order
 * and the worst distance counts; with different counts (a two-color silk against a single color)
 * the first colors give the distance and the check says the counts differ, which is always a
 * mismatch. Returns `null` when either side has no valid color.
 */
export function compareColorLists(
  spoolColors: readonly string[],
  referenceColors: readonly string[],
): ColorCheck | null {
  const spool = spoolColors.map(cleanHex).filter((hex): hex is string => hex !== null);
  const reference = referenceColors.map(cleanHex).filter((hex): hex is string => hex !== null);
  if (!spool.length || !reference.length) return null;
  const countDiffers = spool.length !== reference.length;
  const pairs = countDiffers ? 1 : spool.length;
  let worst = 0;
  let worstIndex = 0;
  for (let index = 0; index < pairs; index++) {
    const distance = deltaE2000(spool[index]!, reference[index]!);
    if (distance > worst || index === 0) {
      worst = distance;
      worstIndex = index;
    }
  }
  const deltaE = round2(worst);
  return {
    spoolHex: spool[worstIndex]!,
    referenceHex: reference[worstIndex]!,
    deltaE,
    verdict: countDiffers ? "mismatch" : classifyDeltaE(deltaE),
    countDiffers,
  };
}

/** Words that name a color family, in the spellings filament makers use. */
const FAMILY_WORDS: Readonly<Record<string, ColorFamily>> = {
  black: "Black",
  onyx: "Black",
  jet: "Black",
  white: "White",
  ivory: "White",
  snow: "White",
  gray: "Gray",
  grey: "Gray",
  silver: "Gray",
  graphite: "Gray",
  charcoal: "Gray",
  slate: "Gray",
  red: "Red",
  crimson: "Red",
  scarlet: "Red",
  burgundy: "Red",
  maroon: "Red",
  orange: "Orange",
  tangerine: "Orange",
  yellow: "Yellow",
  gold: "Yellow",
  lemon: "Yellow",
  green: "Green",
  lime: "Green",
  olive: "Green",
  mint: "Green",
  teal: "Teal",
  turquoise: "Teal",
  cyan: "Teal",
  aqua: "Teal",
  blue: "Blue",
  navy: "Blue",
  azure: "Blue",
  purple: "Purple",
  violet: "Purple",
  lavender: "Purple",
  lilac: "Purple",
  pink: "Pink",
  magenta: "Pink",
  rose: "Pink",
  fuchsia: "Pink",
  brown: "Brown",
  chocolate: "Brown",
  coffee: "Brown",
  bronze: "Brown",
  copper: "Brown",
  tan: "Brown",
  beige: "Brown",
};

/** Names that carry no particular color (or any color), so no hex can contradict them. */
const NEUTRAL_WORDS: ReadonlySet<string> = new Set([
  "natural",
  "clear",
  "transparent",
  "translucent",
  "rainbow",
  "multicolor",
  "multicolour",
  "multi",
  "wood",
  "marble",
  "galaxy",
  "glow",
  "dual",
  "tri",
  "gradient",
]);

/**
 * Families a hex may fall in while a name still reads naturally. Light/dark modifiers and
 * hue-boundary colors push a hex across a boundary (a "Gold" can be yellow, orange or brown; a
 * "Navy" can read as blue or black; "Silver" is gray or white), so a name only conflicts with a hex
 * outside its family and these neighbors.
 */
const NEIGHBORS: Readonly<Record<ColorFamily, readonly ColorFamily[]>> = {
  Black: ["Gray"],
  White: ["Gray", "Pink", "Yellow", "Blue", "Teal"],
  Gray: ["Black", "White", "Blue", "Brown", "Teal"],
  Red: ["Pink", "Orange", "Brown", "Purple", "Black"],
  Orange: ["Red", "Yellow", "Brown"],
  Yellow: ["Orange", "Green", "Brown", "White"],
  Green: ["Teal", "Yellow", "Black"],
  Teal: ["Green", "Blue", "Gray", "Black"],
  Blue: ["Teal", "Purple", "Black", "Gray"],
  Purple: ["Blue", "Pink", "Black"],
  Pink: ["Red", "Purple", "White", "Orange"],
  Brown: ["Orange", "Red", "Yellow", "Black", "Gray"],
};

function wordsOf(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** The color families a name points to, in the order they appear and without repeats. */
export function familiesInName(name: string): ColorFamily[] {
  const found: ColorFamily[] = [];
  for (const word of wordsOf(name)) {
    const family = Object.hasOwn(FAMILY_WORDS, word) ? FAMILY_WORDS[word]! : undefined;
    if (family && !found.includes(family)) found.push(family);
  }
  return found;
}

/**
 * Whether a color name and a hex describe the same thing, judged by hue family. It is a plausibility
 * check, not a measurement: it says "this name does not fit that hex", never which one is right.
 * Names that carry no color word ("Galaxy", "Natural") are `unknown`, as are names with several
 * color words when any of them fits.
 */
export function nameHexPlausibility(
  name: string | null | undefined,
  hex: string | null | undefined,
): NameHexCheck | null {
  const clean = hex ? cleanHex(hex) : null;
  if (!clean) return null;
  const hexFamily = colorFamily(clean);
  const families = name ? familiesInName(name) : [];
  const neutral = name ? wordsOf(name).some((word) => NEUTRAL_WORDS.has(word)) : false;
  if (!families.length || neutral)
    return { state: "unknown", nameFamilies: families, hexFamily };
  const fits = families.some(
    (family) => family === hexFamily || NEIGHBORS[family].includes(hexFamily),
  );
  return { state: fits ? "plausible" : "implausible", nameFamilies: families, hexFamily };
}
