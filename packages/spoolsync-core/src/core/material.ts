import { finishWord } from "./finish";

/**
 * Materials with a canonical type in services that restore only a fixed list of types (Spoolio):
 * the specific material on the left is stored as the type on the right.
 */
export const MATERIAL_TYPES: Record<string, string> = {
  "PLA-Glow": "PLA",
  "PETG+": "PETG",
  "PA6-CF": "PA-CF",
};

/** Base filament types a product line or finish may be added to. */
const BASE_TYPES = new Set([
  "pla",
  "petg",
  "pet",
  "pctg",
  "abs",
  "asa",
  "tpu",
  "tpe",
  "pa",
  "pc",
  "pva",
  "bvoh",
  "hips",
  "pp",
  "pps",
  "pei",
  "peek",
]);

/** Product-line words that change the brand's line but not the base type. */
const LINE_WORDS = new Set([
  "ultra",
  "plus",
  "pro",
  "lite",
  "max",
  "basic",
  "standard",
  "hf",
  "hs",
  "high",
  "speed",
  "flow",
  "rapid",
  "tough",
  "premium",
  "color",
  "colour",
]);

/** Finish words that name a filler (carbon, glass, fibre) change the material itself; not a suffix. */
const FILLERS = new Set(["carbon", "fiber", "fibre", "cf", "gf"]);

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const aliases = new Map(
  Object.entries(MATERIAL_TYPES).map(([specific, base]) => [normalize(specific), normalize(base)]),
);

/** Lower-case tokens: `-`, `_` and spaces separate, `+` is "plus", `HSPLA` is `hs pla`. */
function tokens(material: string): string[] {
  return normalize(material)
    .replace(/\+/g, " plus ")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const prefixed = /^(hs|hf)(.+)$/.exec(token);
      return prefixed && BASE_TYPES.has(prefixed[2]!) ? [prefixed[1]!, prefixed[2]!] : [token];
    });
}

const isSuffixWord = (token: string) =>
  LINE_WORDS.has(token) || (!FILLERS.has(token) && finishWord(token) !== undefined);

/**
 * Whether `base` is the base type of `specific`, or `specific` with only a product line or finish
 * added: PLA is broader than PLA-Glow, HSPLA, PLA-Ultra-Matte and PLA+; PETG is not broader than
 * PLA, PA6 not than PA12, ABS not than ASA, PLA not than PLA-CF (a filler changes the material).
 * Equal materials are not "broader" than each other.
 */
export function isBroaderMaterial(base: string, specific: string): boolean {
  const a = normalize(base);
  const b = normalize(specific);
  if (a === b) return false;
  if (aliases.get(b) === a) return true;
  const baseTokens = tokens(base);
  const specificTokens = tokens(specific);
  if (!BASE_TYPES.has(baseTokens[0] ?? "")) return false;
  // Words other than the base's own tokens, dropped once each from the specific material.
  const rest = [...specificTokens];
  for (const token of baseTokens) {
    const at = rest.indexOf(token);
    if (at < 0) return false;
    rest.splice(at, 1);
  }
  // The leftover (the "hs" in front of HSPLA, the "Ultra" after PLA) must all be suffix words.
  return rest.length > 0 && rest.every(isSuffixWord);
}

/**
 * Two different materials that do not disagree: one is the base type of the other (see
 * {@link isBroaderMaterial}). The more specific one is the richer value.
 */
export const materialsCompatible = (a: string, b: string): boolean =>
  isBroaderMaterial(a, b) || isBroaderMaterial(b, a);
